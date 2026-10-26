"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { isSiteGone, PantryDataError, siteGoneCode } from "../data/client";
import { applyPantryInventoryIn } from "../data/inventory";
import type { PantryItemSet, PantryRow } from "../domain/pantry-item-form";
import { inventoryConfirmSchema, suggestionInvalidText, type InventoryConfirmInput } from "../domain/pantry-suggestion";
import { commitConfirmations } from "./commit-confirmations";
import { revalidatePantryCommitted, revalidateSiteGone } from "./revalidate-committed";
import { checkSiteForWrite } from "./site-for-write";

/** The place is gone, or none was sent: logged with the code only, and the page is read again. */
function siteGone(): Result<never> {
  console.info("pantry_site_gone", { reason: siteGoneCode });
  revalidateSiteGone();
  return fail("pantry_site_gone");
}

/** What confirmPantryInventory did. */
export type ConfirmedInventory = {
  /** How many rows were set. */
  set: number;
  /** The removed rows the domain can read. */
  removed: PantryRow[];
  /** How many rows were removed, also rows the domain cannot read. */
  removedCount: number;
  /** How many rows "Ångra" for the operation can put back (restorePantryRemoval). */
  undoable: number;
  /** The catalog ids the call set (new ones included), so the client can take them out of "Syns inte längre". */
  setIngredientIds: string[];
  /** The operation id the rows are kept under: the one sent, or a new one when it was taken. */
  operationId: string | null;
};

/**
 * Bekräfta, "Bekräfta alla", the sheet's "Bekräfta" and "Ta bort" for a
 * photo compared with its place (Story 6.4, FR-25, AD-2, AD-6, AD-19): what
 * Pontus confirmed, and only that, is added, changed and removed in one
 * transaction. Nothing from the client is trusted: the request is validated
 * (0–40 items, at most 50 rows to replace and 1 000 to remove, something to
 * do, and an operation id with any removal), the items' ingredients are
 * committed through the catalog (commitConfirmations: no synonym, a new one
 * only now, an existing id checked), and apply_pantry_inventory replaces,
 * removes and sets under pantry_lock(), skipping ids that are not the
 * user's rows in the place. The removed rows are kept on the server under
 * `operationId`, so "Ångra" (restorePantryRemoval) puts them back with the
 * same ids. A request with only removals never asks the catalog. Revalidates
 * Hemma and what is derived from the pantry (AD-18) after a successful write
 * only.
 *
 * Story 8.4 (FR-33, AD-24): everything is read and written on the photo's
 * place (`siteId`, sent as `site`), never on the one selected when the call
 * arrives; ids of another place's rows are skipped. `null` is the selected
 * place, and only for a user without places (checkSiteForWrite).
 *
 * Fails with `unauthorized`, `validation` (with the index of each item that
 * is not valid in `fields`, as confirmPantrySuggestions), `pantry_site_gone`
 * (the place is removed or not the user's, or none was sent by a user with
 * places; the page is read again) or `pantry_inventory_failed` (logged with
 * its reason, never with names or amounts); nothing in the pantry is written
 * then. An operation id that is taken (MK409) is tried once more with a new
 * one, for the same place, which the answer gives back, unless the client
 * expects the removals to join it (`joinsOperation`): that is
 * `pantry_inventory_failed`.
 * Once the write has committed the answer is `ok`, also when the database's
 * answer could not all be read (logged as a warning).
 */
export async function confirmPantryInventory(input: InventoryConfirmInput): Promise<Result<ConfirmedInventory>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = inventoryConfirmSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [field, index] = issue.path;
      if (field === "items" && typeof index === "number") fields[String(index)] = suggestionInvalidText;
    }
    return Object.keys(fields).length > 0 ? fail("validation", fields) : fail("validation");
  }
  const { siteId, location, items, replaceRowIds, removeRowIds, operationId, joinsOperation } = parsed.data;
  const db = await createClient();
  const site = await checkSiteForWrite(db, siteId);
  if (!site.ok) return site.reason === "unavailable" ? fail("pantry_inventory_failed") : siteGone();

  let sets: PantryItemSet[] = [];
  if (items.length > 0) {
    try {
      sets = await commitConfirmations(items);
    } catch (error) {
      if (!(error instanceof CatalogDataError)) throw error;
      console.error("pantry_inventory_failed", { reason: `catalog_${error.code}`, detail: error.detail });
      return fail("pantry_inventory_failed");
    }
  }

  // The retry with a new operation id keeps the place.
  const apply = (operation: string | null) =>
    applyPantryInventoryIn(db, { place: location, items: sets, replaceRowIds, removeRowIds, operationId: operation, siteId });
  let applied: Awaited<ReturnType<typeof applyPantryInventoryIn>>;
  let usedOperation = operationId;
  try {
    try {
      applied = await apply(usedOperation);
    } catch (error) {
      // The operation id is taken (MK409): nothing was written. A new id is
      // tried once, but never for a batch the client expects to join, whose
      // removals would otherwise leave its "Ångra" in silence (Story 8.4).
      if (!(error instanceof PantryDataError) || error.detail !== "apply_failed MK409" || !usedOperation || joinsOperation) {
        throw error;
      }
      console.info("pantry_inventory_operation_taken");
      usedOperation = randomUUID();
      applied = await apply(usedOperation);
    }
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    // Nothing was written; the page is read again, so Hemma shows a place that is there.
    if (isSiteGone(error)) return siteGone();
    console.error("pantry_inventory_failed", { reason: error.message, detail: error.detail });
    return fail("pantry_inventory_failed");
  }
  // The write has committed: from here the answer is ok, also when it could not all be read.
  revalidatePantryCommitted();
  if (applied.unreadable || applied.set.length !== sets.length) {
    console.warn("pantry_inventory_answer_unreadable", { set: applied.set.length, expected: sets.length });
  }
  if (applied.removedCount < removeRowIds.length) {
    // Rows another tab removed, or ids that were not this place's: skipped. Only counts are logged.
    console.info("pantry_inventory_skipped", { requested: removeRowIds.length, removed: applied.removedCount });
  }
  if (applied.replaced < replaceRowIds.length) {
    // Rows gone already, kept because an item has their key, or not this place's: counts only.
    console.info("pantry_inventory_replace_skipped", { requested: replaceRowIds.length, replaced: applied.replaced });
  }
  return ok({
    set: applied.set.length,
    removed: applied.removed,
    removedCount: applied.removedCount,
    undoable: applied.undoable,
    setIngredientIds: [...new Set(sets.map((item) => item.ingredientId))],
    operationId: usedOperation,
  });
}

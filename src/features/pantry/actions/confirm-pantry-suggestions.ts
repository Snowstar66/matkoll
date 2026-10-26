"use server";

import { requireUser } from "@/features/auth/server";
import { CatalogDataError } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { setPantryItemsIn } from "../data/set";
import type { PantryItemSet } from "../domain/pantry-item-form";
import { confirmSuggestionsSchema, suggestionInvalidText, type ConfirmItemInput } from "../domain/pantry-suggestion";
import { commitConfirmations } from "./commit-confirmations";

/**
 * Bekräfta, "Bekräfta alla" and the sheet's "Bekräfta" for lagerförslag
 * (FR-25, AD-2, AD-6, AD-19): the confirmed suggestions, and only those,
 * become pantry items. Nothing from the client is trusted: the items are
 * validated, merged (mergeConfirmations), and their ingredients committed
 * through the catalog, where a new one is created only now and an existing
 * id is passed as an exact match, so commitIngredients checks it is in the
 * user's catalog (`unknown_ingredient`) and saves no synonym. The items are
 * merged again on the ids the catalog gave, since a new name can turn out to
 * be an ingredient already in the list. Then each item's amount is set
 * exactly for its ingredient, place and unit, all or nothing
 * (set_pantry_items). The catalog and the pantry are separate
 * modules (AD-1), so new ingredients stay after a failed set, and trying
 * again uses them (commit_ingredients' on conflict). No AI is asked.
 * Revalidates Hemma and the recipes (AD-18) after a successful set only.
 *
 * Returns the number of rows set. Fails with `unauthorized`, `validation`
 * (with the index of each item that is not valid in `fields`, so the client
 * can leave it out) or `pantry_confirm_failed` (logged with its reason,
 * never with names or amounts).
 */
export async function confirmPantrySuggestions(items: readonly ConfirmItemInput[]): Promise<Result<{ count: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = confirmSuggestionsSchema.safeParse(items);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [index] = issue.path;
      if (typeof index === "number") fields[String(index)] = suggestionInvalidText;
    }
    return Object.keys(fields).length > 0 ? fail("validation", fields) : fail("validation");
  }
  let sets: PantryItemSet[];
  try {
    sets = await commitConfirmations(parsed.data);
  } catch (error) {
    if (!(error instanceof CatalogDataError)) throw error;
    console.error("pantry_confirm_failed", { reason: `catalog_${error.code}`, detail: error.detail });
    return fail("pantry_confirm_failed");
  }

  try {
    const rows = await setPantryItemsIn(await createClient(), sets);
    if (rows.length !== sets.length) throw new PantryDataError("missing_rows");
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_confirm_failed", { reason: error.message, detail: error.detail });
    return fail("pantry_confirm_failed");
  }
  revalidateFor("pantry_item");
  return ok({ count: sets.length });
}

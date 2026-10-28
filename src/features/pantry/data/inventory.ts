import "server-only";
import { z } from "zod";
import { locationSchema, type Location } from "@/features/catalog";
import { pantryItemSetSchema, pantryRowSchema, type PantryItemSet, type PantryRow } from "../domain/pantry-item-form";
import { maxConfirmItems, maxInventoryRemovals, maxInventoryReplaces } from "../domain/pantry-suggestion";
import { PantryDataError, pantryWriteError, type PantryDb } from "./client";
import { labelAndTime } from "./remove";
import { labelKeys, type SetPantryRow } from "./set";

const requestSchema = z
  .object({
    place: locationSchema,
    items: z.array(pantryItemSetSchema).max(maxConfirmItems),
    replaceRowIds: z.array(z.uuid()).max(maxInventoryReplaces),
    removeRowIds: z.array(z.uuid()).max(maxInventoryRemovals),
    operationId: z.uuid().nullable(),
    siteId: z.uuid().nullable(),
  })
  .refine(({ items, removeRowIds }) => items.length + removeRowIds.length > 0)
  .refine(({ removeRowIds, operationId }) => removeRowIds.length === 0 || operationId !== null);

export type ApplyInventoryRequest = {
  /** The photographed place: only its rows are replaced or removed. */
  place: Location;
  /** Set exactly, as setPantryItems sets them (ids from the catalog, merged). */
  items: readonly PantryItemSet[];
  /** Rows of an item's ingredient in the place, in units the photo does not have ("Ändrat"). */
  replaceRowIds: readonly string[];
  /** Rows of ingredients no item sets in the place ("Syns inte längre"). */
  removeRowIds: readonly string[];
  /** The client's id for "Ångra"; needed with removals. */
  operationId: string | null;
  /**
   * The photo's place (Story 8.4, AD-24): only its rows are replaced or
   * removed, and the items are set there. `null` is the place selected when
   * the call arrives (a photo of a user without places).
   */
  siteId: string | null;
};

/** What applyPantryInventoryIn did. */
export type AppliedInventory = {
  /** The rows set that the domain can read, in order. */
  set: SetPantryRow[];
  /** The removed rows the domain can read. */
  removed: PantryRow[];
  /** How many rows were removed, also rows the domain cannot read. */
  removedCount: number;
  /** How many rows were replaced ("Ändrat" in other units). */
  replaced: number;
  /** How many rows "Ångra" for the operation can put back: this call's and earlier calls' with the same id. */
  undoable: number;
  /** The write committed, but its answer (or a set row in it) could not be read: the counts may be short. */
  unreadable: boolean;
};

const answerRowSchema = z.object({
  id: z.uuid(),
  site_id: z.uuid().optional(),
  ingredient_id: z.string(),
  location: z.string(),
  amount: z.union([z.number(), z.string()]).nullable(),
  unit: z.string().nullable(),
  label: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

const answerSchema = z.object({
  set: z.array(z.unknown()),
  removed: z.array(z.unknown()),
  replaced: z.number().int().min(0),
  undoable: z.number().int().min(0),
});

/** An answer row as the domain's row, or null when it is not one the domain knows. */
function asRow(value: unknown): PantryRow | null {
  const row = answerRowSchema.safeParse(value);
  if (!row.success) return null;
  const parsed = pantryRowSchema.safeParse({
    id: row.data.id,
    ...(row.data.site_id === undefined ? {} : { siteId: row.data.site_id }),
    ingredientId: row.data.ingredient_id,
    location: row.data.location,
    amount: row.data.amount === null ? null : Number(row.data.amount),
    unit: row.data.unit,
    ...labelAndTime(row.data),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * confirmPantryInventory's write (Story 6.4, AD-19, AD-20) for the signed-in
 * user, in one transaction under pantry_lock() (apply_pantry_inventory):
 * the replaced rows go, the removed rows go and are kept on the server under
 * `operationId` for "Ångra" (restorePantryRemovalIn), and the items are set
 * as set_pantry_items sets them, all on the place `siteId` (Story 8.4,
 * sent as `site`). Ids that are not the user's rows in the location of that
 * place, or whose ingredient an item sets there, are skipped. All or
 * nothing.
 *
 * Throws PantryDataError before anything is written (`invalid_items`) or
 * when Postgres refuses: `site_gone` for a place that is removed or not the
 * user's (MK410), otherwise `apply_failed <code>` (MK409 for an operation id
 * that is taken); nothing is written then. Never throws once the write has
 * committed: an answer it cannot read is `unreadable`, with what it could
 * read.
 */
export async function applyPantryInventoryIn(db: PantryDb, request: ApplyInventoryRequest): Promise<AppliedInventory> {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) throw new PantryDataError("invalid_items");
  const { place, items, replaceRowIds, removeRowIds, operationId, siteId } = parsed.data;

  const { data, error } = await db.rpc("apply_pantry_inventory", {
    place,
    items: items.map((item) => ({
      ingredient_id: item.ingredientId,
      location: item.location,
      amount: item.amount,
      unit: item.unit,
      ...labelKeys(item),
    })),
    replace_ids: replaceRowIds,
    remove_ids: removeRowIds,
    ...(operationId ? { operation_id: operationId } : {}),
    ...(siteId ? { site: siteId } : {}),
  });
  if (error) throw pantryWriteError("apply_failed", error.code);

  const answer = answerSchema.safeParse(data);
  if (!answer.success) {
    return { set: [], removed: [], removedCount: 0, replaced: 0, undoable: 0, unreadable: true };
  }
  const set = answer.data.set.flatMap((value) => {
    const row = asRow(value);
    return row ? [row] : [];
  });
  return {
    set,
    removed: answer.data.removed.flatMap((value) => asRow(value) ?? []),
    removedCount: answer.data.removed.length,
    replaced: answer.data.replaced,
    undoable: answer.data.undoable,
    unreadable: set.length !== answer.data.set.length,
  };
}

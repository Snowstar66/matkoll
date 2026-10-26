import "server-only";
import { z } from "zod";
import { pantryItemSetSchema, type PantryItemSet } from "../domain/pantry-item-form";
import { PantryDataError, pantryWriteError, type PantryDb } from "./client";

const itemsSchema = z.array(pantryItemSetSchema).min(1);
const replaceIdSchema = z.uuid().nullable();
const siteIdSchema = z.uuid().nullish();

/** A row as set_pantry_items left it, with its place (Story 8.4) when the answer had it. */
export type SetPantryRow = PantryItemSet & { id: string; siteId?: string };

/**
 * setPantryItems (AD-19) for the signed-in user (RLS limits it to their
 * rows): each item's amount is set exactly for its ingredient, location and
 * unit, and the row is created when needed; an existing row keeps its id. An
 * ingredient in a location is either unlimited or has amounts, so setting
 * one kind removes the other. `replaceId`, the row being edited, is removed
 * first unless an item keeps its ingredient, location and unit, which moves
 * the row when one of them changed. One transaction (set_pantry_items): all
 * or nothing. Returns the rows set, in order.
 *
 * `siteId` is the place to set on (AD-24, FR-33): the place the sheet was
 * opened for, or the photo's place for confirmed lagerförslag (Story 8.4),
 * also with `replaceId`, which is removed only from that place. Without it,
 * set_pantry_items uses the place selected when the call arrives: only for a
 * photo of a user without places.
 *
 * Throws PantryDataError: `invalid_items` before anything is written,
 * `site_gone` for a place that is gone (MK410), or `set_failed <code>` when
 * Postgres refuses otherwise (e.g. 23503 for an ingredient that is not in
 * the user's catalog).
 */
export async function setPantryItemsIn(
  db: PantryDb,
  items: readonly PantryItemSet[],
  replaceId: string | null = null,
  siteId?: string | null,
): Promise<SetPantryRow[]> {
  const parsedItems = itemsSchema.safeParse(items);
  const parsedReplaceId = replaceIdSchema.safeParse(replaceId);
  const parsedSiteId = siteIdSchema.safeParse(siteId);
  if (!parsedItems.success || !parsedReplaceId.success || !parsedSiteId.success) {
    throw new PantryDataError("invalid_items");
  }

  const { data, error } = await db.rpc("set_pantry_items", {
    items: parsedItems.data.map((item) => ({
      ingredient_id: item.ingredientId,
      location: item.location,
      amount: item.amount,
      unit: item.unit,
      // Story 11.2: left out, the row keeps its label.
      ...(item.label === undefined ? {} : { label: item.label }),
    })),
    ...(parsedReplaceId.data ? { replace_id: parsedReplaceId.data } : {}),
    ...(parsedSiteId.data ? { site: parsedSiteId.data } : {}),
  });
  if (error) throw pantryWriteError("set_failed", error.code);

  return data.map((row) => {
    const parsed = pantryItemSetSchema.safeParse({
      ingredientId: row.ingredient_id,
      location: row.location,
      amount: row.amount === null ? null : Number(row.amount),
      unit: row.unit,
      label: row.label,
    });
    if (!parsed.success) throw new PantryDataError("invalid_row");
    return { id: row.id, siteId: row.site_id, ...parsed.data };
  });
}

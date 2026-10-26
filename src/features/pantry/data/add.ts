import "server-only";
import type { Location } from "@/features/catalog";
import { addToPantryItemsSchema, maxAdditionKeyChars, type AddToPantryItem } from "../domain/add-to-pantry";
import { PantryDataError, siteGoneCode, siteGoneDetail, type PantryDb } from "./client";
import { checkedSiteId } from "./queries";

/** The catalog ingredients' locations by id (catalog.getIngredientDefaults); ids not in the catalog are left out. */
export type IngredientLocations = (ids: readonly string[]) => Promise<Record<string, { location: Location }>>;

/**
 * addToPantry (AD-19) for the signed-in user (RLS limits it to their rows):
 * each item increases the row with the same ingredient, location and unit,
 * or creates it; an ingredient that is unlimited already is left as it is;
 * an item without amount makes the ingredient unlimited in its location.
 * Every item's ingredient is looked up in the catalog with `locations`, and
 * an item without location goes to its catalog ingredient's location.
 * Idempotent per item: an item whose `key`
 * was added before is skipped (pantry_addition). One transaction
 * (add_to_pantry): all or nothing. Returns the number of items handled, i.e.
 * without those skipped for their key.
 *
 * Everything goes to one place (AD-24): `siteId`, or the selected place when
 * it is `null` (add_to_pantry creates Hemma for a user without places). The
 * receipts are per user, not per place: a key added on one place is skipped
 * on every place, since the item was bought once.
 *
 * Throws PantryDataError: `invalid_items`, `invalid_site` (not a uuid) or
 * `unknown_ingredient` (an ingredient the catalog does not return for the
 * user, also with a location given) before anything is written,
 * `site_gone` when the place is removed or not the user's (MK410), or
 * `add_failed <code>` when Postgres refuses. What `locations` throws is
 * passed on.
 */
export async function addToPantryIn(
  db: PantryDb,
  items: readonly AddToPantryItem[],
  locations: IngredientLocations,
  siteId: string | null = null,
): Promise<number> {
  const parsed = addToPantryItemsSchema.safeParse(items);
  if (!parsed.success) throw new PantryDataError("invalid_items");
  const site = siteId === null ? null : checkedSiteId(siteId);

  const defaults = await locations([...new Set(parsed.data.map((item) => item.ingredientId))]);
  const rows = parsed.data.map((item) => {
    const known = defaults[item.ingredientId];
    if (!known) throw new PantryDataError("unknown_ingredient");
    const location = item.location ?? known.location;
    return { key: item.key, ingredient_id: item.ingredientId, location, amount: item.amount, unit: item.unit };
  });

  const { data, error } = await db.rpc("add_to_pantry", site === null ? { items: rows } : { items: rows, site });
  if (error) {
    if (error.code === siteGoneCode) throw new PantryDataError(siteGoneDetail);
    throw new PantryDataError(`add_failed ${error.code}`);
  }
  return data;
}

/**
 * The keys among `keys` that addToPantry has added (their receipts, kept for
 * 30 days), so a caller can tell an item added in an earlier, interrupted
 * run. Throws PantryDataError.
 */
export async function findPantryAdditionsIn(db: PantryDb, keys: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(keys)].filter((key) => key.trim() !== "" && key.length <= maxAdditionKeyChars);
  if (wanted.length === 0) return [];
  const found: string[] = [];
  // In chunks, so the filter stays well within a URL's length.
  for (let start = 0; start < wanted.length; start += 100) {
    const { data, error } = await db
      .from("pantry_addition")
      .select("key")
      .in("key", wanted.slice(start, start + 100));
    if (error) throw new PantryDataError(`find_additions_failed ${error.code}`);
    found.push(...data.map((row) => row.key));
  }
  return found;
}

/**
 * Deletes the receipts of `keys` once the caller is done with them (the
 * shopping list has cleared their checks), so receipts live as long as what
 * they guard; add_to_pantry also deletes those older than 30 days. RLS limits
 * it to the user's own receipts. Throws PantryDataError.
 */
export async function forgetPantryAdditionsIn(db: PantryDb, keys: readonly string[]): Promise<void> {
  const wanted = [...new Set(keys)].filter((key) => key.trim() !== "" && key.length <= maxAdditionKeyChars);
  for (let start = 0; start < wanted.length; start += 100) {
    const { error } = await db
      .from("pantry_addition")
      .delete()
      .in("key", wanted.slice(start, start + 100));
    if (error) throw new PantryDataError(`forget_additions_failed ${error.code}`);
  }
}

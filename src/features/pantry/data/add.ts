import "server-only";
import type { Location } from "@/features/catalog";
import { addToPantryItemsSchema, maxAdditionKeyChars, type AddToPantryItem } from "../domain/add-to-pantry";
import { PantryDataError, type PantryDb } from "./client";

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
 * Throws PantryDataError: `invalid_items` or `unknown_ingredient` (an
 * ingredient the catalog does not return for the user, also with a location
 * given) before anything is written, or `add_failed <code>` when
 * Postgres refuses. What `locations` throws is passed on.
 */
export async function addToPantryIn(
  db: PantryDb,
  items: readonly AddToPantryItem[],
  locations: IngredientLocations,
): Promise<number> {
  const parsed = addToPantryItemsSchema.safeParse(items);
  if (!parsed.success) throw new PantryDataError("invalid_items");

  const defaults = await locations([...new Set(parsed.data.map((item) => item.ingredientId))]);
  const rows = parsed.data.map((item) => {
    const known = defaults[item.ingredientId];
    if (!known) throw new PantryDataError("unknown_ingredient");
    const location = item.location ?? known.location;
    return { key: item.key, ingredient_id: item.ingredientId, location, amount: item.amount, unit: item.unit };
  });

  const { data, error } = await db.rpc("add_to_pantry", { items: rows });
  if (error) throw new PantryDataError(`add_failed ${error.code}`);
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

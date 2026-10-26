import "server-only";
import { LOCATIONS, locationSchema, unitSchema, type Location, type Unit } from "@/features/catalog";
import {
  comparePantryItems,
  toSnapshot,
  type PantryAmountRow,
  type PantryItem,
  type PantrySnapshot,
} from "../domain/pantry-item";
import { PantryDataError, type PantryDb } from "./client";

/**
 * The catalog's names for ingredient ids. Passed in, because only the catalog
 * reads its tables (AD-1): in requests, catalog.getIngredientNames.
 */
export type IngredientNames = (ids: readonly string[]) => Promise<Record<string, string>>;

/**
 * Rows per request: the API's row limit (max_rows in supabase/config.toml,
 * checked by tests/design/pantry-paging.test.ts), so a full page means there
 * may be more.
 */
export const pantryPageSize = 1000;

type Page<Row> = PromiseLike<{ data: Row[] | null; error: { code: string } | null }>;

/** Every row of an ordered query, fetched page by page with `.range()` until a short page. */
async function allPages<Row>(page: (from: number, to: number) => Page<Row>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pantryPageSize) {
    const { data, error } = await page(from, from + pantryPageSize - 1);
    if (error) throw new PantryDataError(`query_failed ${error.code}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pantryPageSize) return rows;
  }
}

type AmountColumns = { amount: number | null; unit: string | null };

/**
 * The row's amount and unit, checked: the database's check lists equal the
 * domain's (tests/design/pantry-checks.test.ts), and an amount always has a
 * unit (pantry_item_unlimited_check).
 */
function amountOf(row: AmountColumns): { amount: number | null; unit: Unit | null } {
  if (row.amount === null && row.unit === null) return { amount: null, unit: null };
  const unit = unitSchema.safeParse(row.unit);
  const amount = Number(row.amount);
  if (!unit.success || !Number.isFinite(amount) || amount <= 0) throw new PantryDataError("invalid_row");
  return { amount, unit: unit.data };
}

/**
 * The signed-in user's pantry items in `location` (RLS limits the rows to the
 * user's own) with their catalog ingredients' names, sorted by name
 * (comparePantryItems). Throws PantryDataError when a query fails or a row's
 * ingredient has no name.
 */
export async function listPantryIn(
  db: PantryDb,
  location: Location,
  ingredientNames: IngredientNames,
): Promise<PantryItem[]> {
  const rows = await allPages((from, to) =>
    db
      .from("pantry_item")
      .select("id, ingredient_id, location, amount, unit")
      .eq("location", location)
      .order("id")
      .range(from, to),
  );
  // getIngredientNames looks the ids up in chunks of 100.
  const ids = [...new Set(rows.map((row) => row.ingredient_id))];
  const names = ids.length > 0 ? await ingredientNames(ids) : {};

  const items = rows.map((row): PantryItem => {
    const name = names[row.ingredient_id];
    const place = locationSchema.safeParse(row.location);
    // The foreign key keeps the ingredient in the user's catalog (AD-20).
    if (name === undefined || !place.success) throw new PantryDataError("invalid_row");
    return { id: row.id, ingredientId: row.ingredient_id, name, location: place.data, ...amountOf(row) };
  });
  return items.sort(comparePantryItems);
}

/** The number of the signed-in user's pantry items in each location, counted by the database. */
export async function countPantryIn(db: PantryDb): Promise<Record<Location, number>> {
  const counts = await Promise.all(
    LOCATIONS.map(async (location) => {
      const { count, error } = await db
        .from("pantry_item")
        .select("id", { count: "exact", head: true })
        .eq("location", location);
      if (error) throw new PantryDataError(`query_failed ${error.code}`);
      return [location, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<Location, number>;
}

/**
 * The signed-in user's whole pantry per ingredient, summed over locations
 * (toSnapshot, AD-19). Throws PantryDataError.
 */
export async function loadPantrySnapshot(db: PantryDb): Promise<PantrySnapshot> {
  const rows = await allPages((from, to) =>
    db.from("pantry_item").select("id, ingredient_id, amount, unit").order("id").range(from, to),
  );
  return toSnapshot(rows.map((row): PantryAmountRow => ({ ingredientId: row.ingredient_id, ...amountOf(row) })));
}

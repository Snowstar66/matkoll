import "server-only";
import { z } from "zod";
import {
  LOCATIONS,
  locationSchema,
  unitSchema,
  type IngredientSummary,
  type Location,
  type Unit,
} from "@/features/catalog";
import {
  comparePantryItems,
  toSnapshot,
  type PantryAmountRow,
  type PantryItem,
  type PantrySnapshot,
} from "../domain/pantry-item";
import { pantryLabelSchema } from "../domain/pantry-item-form";
import { PantryDataError, type PantryDb } from "./client";
import { loadSelectedSiteIdIn } from "./sites";

// Every read below is of one place (AD-19, AD-24): `siteId`, or the selected
// place when it is not given. The pantry is never summed over places. A user
// without a selected place (before ensure_pantry_defaults) has an empty
// pantry: the place filter is never left out. Every pantry_item read in src/
// goes through these functions (tests/design/pantry-site-reads.test.ts).
//
// They need the signed-in user's session client, never an admin client: RLS
// limits the rows to the user's own, and the selected place is the session
// user's.

/**
 * The catalog's names and sections for ingredient ids. Passed in, because
 * only the catalog reads its tables (AD-1): in requests,
 * catalog.getIngredientSummaries.
 */
export type IngredientSummaries = (ids: readonly string[]) => Promise<Record<string, IngredientSummary>>;

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

const siteIdSchema = z.uuid();

/**
 * `siteId` checked as a uuid; PantryDataError `invalid_site` otherwise.
 * Whether the place is the user's is not checked here: RLS gives another
 * user's place no rows. pantry/server.ts checks it against the user's places
 * first, and gives `site_gone` (pantry_site_gone, Story 8.2).
 */
export function checkedSiteId(siteId: string): string {
  if (!siteIdSchema.safeParse(siteId).success) throw new PantryDataError("invalid_site");
  return siteId;
}

/** The place to read: `siteId`, or the selected place; null when the user has none. */
async function placeToRead(db: PantryDb, siteId: string | undefined): Promise<string | null> {
  return siteId === undefined ? await loadSelectedSiteIdIn(db) : checkedSiteId(siteId);
}

/** Every location with no items: what an empty pantry counts. */
export function zeroCounts(): Record<Location, number> {
  return Object.fromEntries(LOCATIONS.map((location) => [location, 0])) as Record<Location, number>;
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
 * The signed-in user's pantry items in `location` on one place (`siteId`, or
 * the selected place; RLS limits the rows to the user's own) with their
 * catalog ingredients' names and sections, labels and the times they were
 * added (Story 11.2), sorted by name (comparePantryItems). Throws
 * PantryDataError when a query fails or a row's ingredient has no name.
 */
export async function listPantryIn(
  db: PantryDb,
  location: Location,
  ingredientSummaries: IngredientSummaries,
  siteId?: string,
): Promise<PantryItem[]> {
  const place = await placeToRead(db, siteId);
  if (place === null) return [];
  const rows = await allPages((from, to) =>
    db
      .from("pantry_item")
      .select("id, site_id, ingredient_id, location, amount, unit, label, created_at")
      .eq("site_id", place)
      .eq("location", location)
      .order("id")
      .range(from, to),
  );
  // getIngredientSummaries looks the ids up in chunks of 100.
  const ids = [...new Set(rows.map((row) => row.ingredient_id))];
  const summaries = ids.length > 0 ? await ingredientSummaries(ids) : {};

  const items = rows.map((row): PantryItem => {
    const summary = summaries[row.ingredient_id];
    const place = locationSchema.safeParse(row.location);
    // The table's check is pantryLabelSchema's rule (tests/design/pantry-checks.test.ts).
    const label = pantryLabelSchema.nullable().safeParse(row.label);
    // The foreign key keeps the ingredient in the user's catalog (AD-20).
    if (summary === undefined || !place.success || !label.success) throw new PantryDataError("invalid_row");
    return {
      id: row.id,
      siteId: row.site_id,
      ingredientId: row.ingredient_id,
      name: summary.name,
      location: place.data,
      ...amountOf(row),
      label: label.data,
      createdAt: row.created_at,
      section: summary.section,
    };
  });
  return items.sort(comparePantryItems);
}

/**
 * The number of the signed-in user's pantry items in each location of one
 * place (`siteId`, or the selected place), counted by the database.
 */
export async function countPantryIn(db: PantryDb, siteId?: string): Promise<Record<Location, number>> {
  const place = await placeToRead(db, siteId);
  if (place === null) return zeroCounts();
  const counts = await Promise.all(
    LOCATIONS.map(async (location) => {
      const { count, error } = await db
        .from("pantry_item")
        .select("id", { count: "exact", head: true })
        .eq("site_id", place)
        .eq("location", location);
      if (error) throw new PantryDataError(`query_failed ${error.code}`);
      return [location, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<Location, number>;
}

/**
 * The signed-in user's pantry on one place (`siteId`, or the selected place)
 * per ingredient, summed over the place's locations and never over places
 * (toSnapshot, AD-19, AD-24). Throws PantryDataError.
 */
export async function loadPantrySnapshot(db: PantryDb, siteId?: string): Promise<PantrySnapshot> {
  const place = await placeToRead(db, siteId);
  if (place === null) return toSnapshot([]);
  const rows = await allPages((from, to) =>
    db
      .from("pantry_item")
      .select("id, ingredient_id, amount, unit")
      .eq("site_id", place)
      .order("id")
      .range(from, to),
  );
  return toSnapshot(rows.map((row): PantryAmountRow => ({ ingredientId: row.ingredient_id, ...amountOf(row) })));
}

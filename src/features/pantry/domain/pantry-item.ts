import { UNITS, type Location, type Section, type Unit } from "@/features/catalog";
import type { LastChange } from "@/features/household";

// What is at home (FR-11, FR-12, AD-19): a pantry item points at a catalog
// ingredient and is kept in one location, with an amount and unit or
// unlimited (both null), which is always enough. Pure, so it is tested
// without a database.

/** A pantry item as Hemma shows it, with the catalog ingredient's name. */
export type PantryItem = {
  id: string;
  /** The place the item is on (AD-24): every write from Hemma sends it, so it lands where the view showed it (FR-33). */
  siteId: string;
  ingredientId: string;
  /** The catalog ingredient's name (catalog.getIngredientNames). */
  name: string;
  location: Location;
  /** `null` together with `unit`: unlimited. Otherwise above 0. */
  amount: number | null;
  unit: Unit | null;
  /** Story 11.2 (FR-42): the brand or kind ("Arla laktosfri"), 1–60 characters, or `null`. */
  label: string | null;
  /**
   * When the item was added (`created_at`, ISO 8601): kept when the amount
   * changes, the row is replaced, and after "Ångra". `null` only on a
   * placeholder for a row the list never showed (pantry-removal.tsx).
   */
  createdAt: string | null;
  /** The catalog ingredient's section, so the view can work out its category (AD-12). */
  section: Section;
  /** Story 21.3: who else in the household last added or changed it, and when; absent or null when that was me. */
  lastChange?: LastChange | null;
};

/** An amount at home in one unit. Units are never converted into each other (AD-12). */
export type PantryAmount = { unit: Unit; amount: number };

/** What is at home of one ingredient, over all locations. */
export type PantryStock = {
  /** Some row has no amount, so the ingredient is always enough. */
  unlimited: boolean;
  /** The rows with an amount, summed per unit in the order of UNITS. */
  amounts: PantryAmount[];
};

/**
 * The whole pantry per catalog ingredient id, summed over locations (AD-19).
 * The only form of the pantry that `coverage` takes.
 */
export type PantrySnapshot = Map<string, PantryStock>;

/**
 * The part of the snapshot for `ingredientIds`, for a page that sends it to
 * the browser: only what the status of those ingredients reads.
 */
export function snapshotFor(snapshot: PantrySnapshot, ingredientIds: Iterable<string | null>): PantrySnapshot {
  const part: PantrySnapshot = new Map();
  for (const id of ingredientIds) {
    const stock = id === null ? undefined : snapshot.get(id);
    if (id !== null && stock) part.set(id, stock);
  }
  return part;
}

/** The part of a pantry row the snapshot needs. */
export type PantryAmountRow = Pick<PantryItem, "ingredientId" | "amount" | "unit">;

const unitOrder = (unit: Unit) => UNITS.indexOf(unit);

/** Sums are kept to six decimals, far below what formatQuantity shows. */
const sumPrecision = 1e6;

/**
 * A sum of amounts rounded to 1e-6, which drops binary noise (0.1 + 0.2 is
 * 0.3). The snapshot and aggregateNeeds round alike, so their sums compare
 * exactly; rounding for display is formatQuantity's alone.
 */
export function roundSum(amount: number): number {
  return Math.round(amount * sumPrecision) / sumPrecision;
}

/**
 * Sums `rows` per ingredient and unit over all locations: Mjölk 1 l in Kyl and
 * 1 l in Frys is `{ unlimited: false, amounts: [{ unit: "l", amount: 2 }] }`.
 * An ingredient with a row without amount is `unlimited`; its rows with an
 * amount are still summed. Each sum is rounded to 1e-6 to drop binary
 * noise (0.1 + 0.2 is 0.3); rounding for display is formatQuantity's alone.
 */
export function toSnapshot(rows: readonly PantryAmountRow[]): PantrySnapshot {
  const sums = new Map<string, { unlimited: boolean; byUnit: Map<Unit, number> }>();
  for (const row of rows) {
    let stock = sums.get(row.ingredientId);
    if (!stock) {
      stock = { unlimited: false, byUnit: new Map() };
      sums.set(row.ingredientId, stock);
    }
    if (row.amount === null || row.unit === null) {
      stock.unlimited = true;
    } else {
      stock.byUnit.set(row.unit, (stock.byUnit.get(row.unit) ?? 0) + row.amount);
    }
  }

  const snapshot: PantrySnapshot = new Map();
  for (const [ingredientId, { unlimited, byUnit }] of sums) {
    const amounts = [...byUnit]
      .map(([unit, amount]) => ({ unit, amount: roundSum(amount) }))
      .sort((a, b) => unitOrder(a.unit) - unitOrder(b.unit));
    snapshot.set(ingredientId, { unlimited, amounts });
  }
  return snapshot;
}

const nameOrder = new Intl.Collator("sv-SE", { sensitivity: "base", numeric: true });
/** Unlimited (no unit) first, then the order of UNITS. */
const unitRank = (unit: Unit | null) => (unit === null ? -1 : unitOrder(unit));

/**
 * Hemma's order: by name in Swedish alphabetical order (å, ä, ö last), then
 * unlimited before amounts, then by unit in the order of UNITS, then by id, so
 * the order never changes between reads.
 */
export function comparePantryItems(a: PantryItem, b: PantryItem): number {
  return (
    nameOrder.compare(a.name, b.name) ||
    unitRank(a.unit) - unitRank(b.unit) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

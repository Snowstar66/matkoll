import type { Location, Unit } from "@/features/catalog";
import { roundSum } from "./pantry-item";

// Story 16.18 ("Packa upp kassarna"): moving what was just bought from one
// place to another, e.g. the bread from Skafferi to Frys. Only the bought
// amount moves; what was at home stays where it was. Pure, so it is tested
// without a database.

/** What was bought: the ingredient and the amount added to the pantry (both amount and unit null: unlimited). */
export type MovedItem = { ingredientId: string; amount: number | null; unit: Unit | null };

/** The parts of a pantry row the move needs. */
export type MoveRow = {
  id: string;
  ingredientId: string;
  amount: number | null;
  unit: Unit | null;
  label: string | null;
};

/** One write for setPantryItems: the amount is set exactly. */
export type MoveSet = {
  ingredientId: string;
  location: Location;
  amount: number | null;
  unit: Unit | null;
  label?: string;
};

/**
 * The writes of a move, in order. `set`s run first (the destination, then a
 * source that keeps some of its amount); `replaceId` is the source row to
 * remove with the first set when nothing stays behind (one transaction).
 */
export type MovePlan = { sets: MoveSet[]; replaceId: string | null };

/** The row of `item` among `rows`: same ingredient and unit (no unit: the unlimited row). */
export function findMoveRow(rows: readonly MoveRow[], item: MovedItem): MoveRow | null {
  return rows.find((row) => row.ingredientId === item.ingredientId && row.unit === item.unit) ?? null;
}

/**
 * How `item` moves from `from` to `to`. Returns null when the source has no
 * such row (it was removed or already moved elsewhere).
 * - The bought amount moves; a row that has no more than that, or is
 *   unlimited, moves whole.
 * - On the destination the amount is added to a row with the same ingredient
 *   and unit; an unlimited destination stays unlimited.
 * - What stays behind keeps its amount; the source row is removed when
 *   nothing stays.
 */
export function planMove(
  from: readonly MoveRow[],
  to: readonly MoveRow[],
  item: MovedItem,
  destination: Location,
  source: Location,
): MovePlan | null {
  const row = findMoveRow(from, item);
  if (!row) return null;
  const whole = row.amount === null || item.amount === null || roundSum(row.amount - item.amount) <= 0;
  const moved = whole ? row.amount : item.amount;
  const unit = row.unit;

  const existing = to.find((each) => each.ingredientId === item.ingredientId && each.unit === unit);
  const destinationUnlimited = to.some((each) => each.ingredientId === item.ingredientId && each.amount === null);
  let amount = moved;
  if (moved !== null && existing?.amount != null) amount = roundSum(existing.amount + moved);
  // An unlimited ingredient on the destination is enough already.
  const label = existing ? undefined : (row.label ?? undefined);
  const sets: MoveSet[] = [];
  if (!(destinationUnlimited && moved !== null && !existing?.amount)) {
    sets.push({
      ingredientId: item.ingredientId,
      location: destination,
      amount,
      unit: amount === null ? null : unit,
      ...(label ? { label } : {}),
    });
  }
  if (whole) return { sets, replaceId: row.id };
  sets.push({ ingredientId: item.ingredientId, location: source, amount: roundSum(row.amount! - item.amount!), unit });
  return { sets, replaceId: null };
}

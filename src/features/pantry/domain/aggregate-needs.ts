import type { Unit } from "@/features/catalog";
import { roundSum } from "./pantry-item";

// What a recipe needs from the pantry (AD-7): its lines summed per catalog
// ingredient and unit. The only place needs are summed. Pure, so it is tested
// without a database.

/** The part of a recipe line the amount logic reads; a saved recipe's lines have these fields. */
export type NeedLine = {
  /** `null`: the line has no catalog ingredient and is never compared with the pantry. */
  ingredientId: string | null;
  /** `null` for a vague line ("salt efter smak"). */
  amount: number | null;
  /** `null` with an amount means pieces: "1 purjolök" is 1 st (decision 2026-10-26). */
  unit: Unit | null;
  isVague: boolean;
};

/**
 * What a recipe needs of one catalog ingredient: an amount in one unit, or,
 * for vague lines, the ingredient in any form (`amount` and `unit` null).
 */
export type Need =
  | { ingredientId: string; amount: number; unit: Unit }
  | { ingredientId: string; amount: null; unit: null };

/** The unit a line with an amount is compared in: its own, or `st` when it has none. */
const unitOf = (line: NeedLine): Unit => line.unit ?? "st";

/** Whether the line only asks for the ingredient in some form. */
const isVague = (line: NeedLine) => line.isVague || line.amount === null;

const keyOf = (ingredientId: string, unit: Unit | null) => `${ingredientId}:${unit ?? "-"}`;

/** The need's key: ingredient and unit, or ingredient and `-` for a vague need. */
export function needKey(need: Need): string {
  return keyOf(need.ingredientId, need.unit);
}

/**
 * The key of the need a line counts towards (needKey), or `null` for a line
 * without a catalog ingredient, which needs nothing from the pantry.
 */
export function lineNeedKey(line: NeedLine): string | null {
  if (line.ingredientId === null) return null;
  return keyOf(line.ingredientId, isVague(line) ? null : unitOf(line));
}

/**
 * The lines' needs, summed per `(ingredientId, unit)` with each amount times
 * `factor` (1 for the recipe's own servings), in the order each need first
 * appears. "1 dl grädde" and "2 dl grädde" need 3 dl; "1 dl" and "100 g" stay
 * two needs, since units are never converted (AD-12). A vague line is its
 * own need of the ingredient in any form. Lines without a catalog ingredient
 * are left out. Sums are rounded to 1e-6, as the snapshot's are.
 */
export function aggregateNeeds(lines: readonly NeedLine[], factor: number): Need[] {
  const needs = new Map<string, Need>();
  for (const line of lines) {
    const key = lineNeedKey(line);
    if (key === null || line.ingredientId === null) continue;
    const before = needs.get(key);
    if (isVague(line)) {
      if (!before) needs.set(key, { ingredientId: line.ingredientId, amount: null, unit: null });
      continue;
    }
    const amount = (line.amount ?? 0) * factor + (before?.amount ?? 0);
    needs.set(key, { ingredientId: line.ingredientId, amount: roundSum(amount), unit: unitOf(line) });
  }
  return [...needs.values()];
}

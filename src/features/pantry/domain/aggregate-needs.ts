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

/** A line on a list of several recipes, with the id of what it comes from (a matsedelsrätt). */
export type OriginLine = NeedLine & { origin: string };

/** A need with what it comes from: each origin once, in the order its lines first appear. */
export type NeedWithOrigins = Need & { origins: string[] };

type Summed = { need: Need; origins: string[] };

/** The one summation behind aggregateNeeds and aggregateNeedsWithOrigins. */
function sumNeeds<L extends NeedLine>(
  lines: readonly L[],
  factor: number,
  originOf: (line: L) => string | null,
): Summed[] {
  const needs = new Map<string, Summed>();
  for (const line of lines) {
    const key = lineNeedKey(line);
    if (key === null || line.ingredientId === null) continue;
    const before = needs.get(key);
    const origins = before?.origins ?? [];
    const origin = originOf(line);
    if (origin !== null && !origins.includes(origin)) origins.push(origin);
    if (isVague(line)) {
      if (!before) needs.set(key, { need: { ingredientId: line.ingredientId, amount: null, unit: null }, origins });
      continue;
    }
    const amount = (line.amount ?? 0) * factor + (before?.need.amount ?? 0);
    needs.set(key, {
      need: { ingredientId: line.ingredientId, amount: roundSum(amount), unit: unitOf(line) },
      origins,
    });
  }
  return [...needs.values()];
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
  return sumNeeds(lines, factor, () => null).map(({ need }) => need);
}

/**
 * As aggregateNeeds, for lines from several recipes that are already scaled
 * (recipes.scaleLines), so the factor is 1: each need also says which origins
 * (matsedelsrätter) its lines come from, for "från [rätt]" on the shopping
 * list (AD-7, AD-8).
 */
export function aggregateNeedsWithOrigins(lines: readonly OriginLine[]): NeedWithOrigins[] {
  return sumNeeds(lines, 1, (line) => line.origin).map(({ need, origins }) => ({ ...need, origins }));
}

import { displayAmount, formatQuantity } from "@/features/catalog";
import type { Need } from "./aggregate-needs";
import { roundSum, type PantryAmount, type PantrySnapshot } from "./pantry-item";

// How far the pantry covers one need (AD-7): the only comparison with the
// pantry. Each recipe is compared with the whole pantry; nothing is shared out
// between recipes. Pure, so it is tested without a database.

export type Coverage =
  /** Enough at home: an unlimited item, enough in the need's unit, or any form for a vague need. */
  | { kind: "covered" }
  /**
   * Some at home in the need's unit, but not enough; `remaining` is what is
   * short, `amounts` everything at home of the ingredient, in every unit.
   */
  | { kind: "partial"; remaining: number; amounts: PantryAmount[] }
  /** At home only in other units, which are never converted (AD-12); the pantry's amounts. */
  | { kind: "other-unit"; amounts: PantryAmount[] }
  /** Not at home at all. */
  | { kind: "missing" }
  /** A vague need ("salt efter smak") whose ingredient is not at home in any form. */
  | { kind: "vague-missing" };

/** Whether the coverage counts towards "Saknar N varor": vague lines never do. */
export function isShort(coverage: Coverage): boolean {
  return coverage.kind === "missing" || coverage.kind === "partial" || coverage.kind === "other-unit";
}

/**
 * How the pantry covers `need`. An unlimited item is always enough; a vague
 * need is covered by the ingredient in any form; an amount is compared only
 * with the pantry's amount in the same unit, both as they are shown
 * (catalog.displayAmount): 3,333 dl needed with 3,33 dl at home is covered,
 * so a line never reads "3,33 dl" short beside "hemma: 3,33 dl", and the
 * shopping list never asks for "<0,01 dl".
 */
export function coverage(need: Need, snapshot: PantrySnapshot): Coverage {
  const stock = snapshot.get(need.ingredientId);
  const atHome = stock !== undefined && (stock.unlimited || stock.amounts.length > 0);
  if (need.amount === null) return atHome ? { kind: "covered" } : { kind: "vague-missing" };
  if (!atHome) return { kind: "missing" };
  if (stock.unlimited) return { kind: "covered" };

  const same = stock.amounts.find((amount) => amount.unit === need.unit);
  if (!same) return { kind: "other-unit", amounts: stock.amounts };
  if (displayAmount(same.amount) >= displayAmount(need.amount)) return { kind: "covered" };
  return { kind: "partial", remaining: roundSum(need.amount - same.amount), amounts: stock.amounts };
}

/** What is at home, beside a short need: "hemma: 1 kg" or "hemma: 2 dl, 1 l". */
export function atHomeText(amounts: readonly PantryAmount[]): string {
  return `hemma: ${amounts.map(({ amount, unit }) => formatQuantity(amount, unit)).join(", ")}`;
}

import { isStaple, noStaples, type StapleRules } from "@/features/pantry";
import type { Unit } from "@/features/catalog";
import { offersUsed, type OfferInfo } from "./offer-input";

// The filter Erbjudanden in Recept (Story 9.3): which of the library's recipes
// use this week's offers on a main ingredient, and which offers. Counted
// without AI. Pure, so it is tested without a database.

/** A recipe line as the filter reads it. */
export type OfferRecipeLine = { ingredientId: string | null; amount: number | null; unit: Unit | null };

/** A library recipe as the filter reads it. */
export type OfferRecipe = { id: string; lines: readonly OfferRecipeLine[] };

/** Spoon measures of a spice (a pinch, a teaspoon): never what a dish is built on. */
const spiceUnits: ReadonlySet<Unit> = new Set<Unit>(["krm", "tsk"]);

/**
 * Whether a line is a main ingredient: it has a catalog ingredient (a vague
 * line, "efter smak", has none and is never compared with an offer), it is not
 * one of the household's Basvaror within its limit (salt, olive oil, ...) and
 * it is not measured in pinches or teaspoons, which is how spices are written.
 */
export function isMainLine(line: OfferRecipeLine, staples: StapleRules = noStaples): boolean {
  if (!line.ingredientId) return false;
  if (line.unit && spiceUnits.has(line.unit)) return false;
  return !isStaple(staples, { ingredientId: line.ingredientId, name: "", amount: line.amount, unit: line.unit });
}

/**
 * The labels of the offers each recipe uses on a main ingredient, by recipe
 * id, in the sheet's order, each offer once. A recipe where only a spice or a
 * vague line is on offer has no entry.
 */
export function offerTagsByRecipe(
  offers: readonly OfferInfo[],
  recipes: readonly OfferRecipe[],
  staples: StapleRules = noStaples,
): Record<string, string[]> {
  const tags: Record<string, string[]> = {};
  if (offers.length === 0) return tags;
  for (const recipe of recipes) {
    const main = new Set(recipe.lines.filter((line) => isMainLine(line, staples)).flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])));
    if (main.size === 0) continue;
    const labels = offersUsed(offers, main, []);
    if (labels.length > 0) tags[recipe.id] = labels;
  }
  return tags;
}

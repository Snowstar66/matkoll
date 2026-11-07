import { isStaple, noStaples, type StapleRules } from "@/features/pantry";
import type { Unit } from "@/features/catalog";
import { offerTagOf, type OfferTagData } from "@/lib/offer-tag";
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
 * The offers each recipe uses on a main ingredient as tags (UX-20: the short
 * item name and the price), by recipe id, in the sheet's order, each offer
 * once. A recipe where only a spice or a vague line is on offer has no entry.
 */
export function offerTagsByRecipe(
  offers: readonly OfferInfo[],
  recipes: readonly OfferRecipe[],
  staples: StapleRules = noStaples,
): Record<string, OfferTagData[]> {
  const tags: Record<string, OfferTagData[]> = {};
  if (offers.length === 0) return tags;
  for (const recipe of recipes) {
    const main = new Set(recipe.lines.filter((line) => isMainLine(line, staples)).flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])));
    if (main.size === 0) continue;
    const labels = offersUsed(offers, main, []);
    const used = labels.flatMap((label) => {
      const offer = offers.find((candidate) => candidate.label === label);
      return offer ? [offerTagOf(offer)] : [];
    });
    if (used.length > 0) tags[recipe.id] = used;
  }
  return tags;
}

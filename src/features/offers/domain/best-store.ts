// "Veckans bästa butik" (Story 9.14): which store's offers fit Pontus best
// this week, counted without AI from the pantry and the recipe library. Pure.

import type { StoreOffer } from "./offer";

/** What the score reads of an offer. */
export type ScoredOffer = Pick<StoreOffer, "storeId" | "ingredientId" | "savingPercent">;

/** The best store and why: how many of its offers fit, of how many it has. */
export type BestStore = { storeId: string; fits: number; total: number; score: number };

/** Most recipes that count for one ingredient, so a staple does not decide alone. */
const maxRecipeWeight = 3;

/**
 * An offer fits when its catalog ingredient is in the pantry or is used by a
 * recipe in the library. A fitting offer counts 1, plus 0.5 when it is in the
 * pantry, plus 0.25 per recipe using it (at most three); a stated saving adds
 * up to 0.5 for every offer (100 % is 0.5). Ties go to the store with more
 * offers, then to the first in `storeIds` (the sheet's order).
 */
export function bestStore(
  offers: readonly ScoredOffer[],
  storeIds: readonly string[],
  pantryIngredientIds: ReadonlySet<string>,
  recipeCounts: ReadonlyMap<string, number>,
): BestStore | null {
  const scored = storeIds.flatMap((storeId): BestStore[] => {
    const own = offers.filter((offer) => offer.storeId === storeId);
    if (own.length === 0) return [];
    let fits = 0;
    let score = 0;
    for (const offer of own) {
      const inPantry = offer.ingredientId !== null && pantryIngredientIds.has(offer.ingredientId);
      const recipes = offer.ingredientId !== null ? (recipeCounts.get(offer.ingredientId) ?? 0) : 0;
      if (inPantry || recipes > 0) {
        fits += 1;
        score += 1 + (inPantry ? 0.5 : 0) + 0.25 * Math.min(recipes, maxRecipeWeight);
      }
      score += Math.min(Math.max(offer.savingPercent ?? 0, 0), 100) / 200;
    }
    return [{ storeId, fits, total: own.length, score }];
  });
  let best: BestStore | null = null;
  for (const candidate of scored) {
    if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.total > best.total)) best = candidate;
  }
  return best;
}

/** "12 erbjudanden passar det du brukar laga", else "5 erbjudanden". */
export function bestStoreReason(best: Pick<BestStore, "fits" | "total">): string {
  if (best.fits > 0) return `${best.fits} ${best.fits === 1 ? "erbjudande passar" : "erbjudanden passar"} det du brukar laga`;
  return `${best.total} ${best.total === 1 ? "erbjudande" : "erbjudanden"}`;
}

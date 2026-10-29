// "Veckans bästa butik" (Story 9.14): which store's offers fit Pontus best
// this week, counted without AI from the pantry and the recipe library. Pure.

import type { StoreOffer } from "./offer";
import { offerDisplay } from "./offer-display";

/** What the score reads of an offer. */
export type ScoredOffer = Pick<StoreOffer, "id" | "label" | "storeId" | "ingredientId" | "savingPercent">;

/** Why an offer fits: the ingredient is in the pantry, in recipes, or both. */
export type FitSource = "pantry" | "recipes" | "both";

/** An offer that fits: its id and its cleaned name (Story 16.7). */
export type FitMatch = { id: string; name: string; source: FitSource };

/** The best store and why: how many of its offers fit, of how many it has. */
export type BestStore = { storeId: string; fits: number; total: number; score: number; matches: FitMatch[] };

/** Most recipes that count for one ingredient, so a staple does not decide alone. */
const maxRecipeWeight = 3;

/** How an offer fits the pantry and the recipes, or `null` when it does not. The one rule behind the score, the line and "Passar dig". */
export function fitSource(
  offer: Pick<ScoredOffer, "ingredientId">,
  pantryIngredientIds: ReadonlySet<string>,
  recipeCounts: ReadonlyMap<string, number>,
): FitSource | null {
  if (offer.ingredientId === null) return null;
  const inPantry = pantryIngredientIds.has(offer.ingredientId);
  const inRecipes = (recipeCounts.get(offer.ingredientId) ?? 0) > 0;
  if (inPantry && inRecipes) return "both";
  return inPantry ? "pantry" : inRecipes ? "recipes" : null;
}

/** The ids of the offers that fit, with how (Story 16.7: "Passar dig" in the list). */
export function fittingOffers(
  offers: readonly ScoredOffer[],
  pantryIngredientIds: ReadonlySet<string>,
  recipeCounts: ReadonlyMap<string, number>,
): Map<string, FitSource> {
  const fitting = new Map<string, FitSource>();
  for (const offer of offers) {
    const source = fitSource(offer, pantryIngredientIds, recipeCounts);
    if (source) fitting.set(offer.id, source);
  }
  return fitting;
}

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
    const matches: FitMatch[] = [];
    for (const offer of own) {
      const source = fitSource(offer, pantryIngredientIds, recipeCounts);
      const inPantry = source === "pantry" || source === "both";
      const recipes = offer.ingredientId !== null ? (recipeCounts.get(offer.ingredientId) ?? 0) : 0;
      if (source) {
        matches.push({ id: offer.id, name: offerDisplay(offer.label).title, source });
        fits += 1;
        score += 1 + (inPantry ? 0.5 : 0) + 0.25 * Math.min(recipes, maxRecipeWeight);
      }
      score += Math.min(Math.max(offer.savingPercent ?? 0, 0), 100) / 200;
    }
    return [{ storeId, fits, total: own.length, score, matches }];
  });
  let best: BestStore | null = null;
  for (const candidate of scored) {
    if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.total > best.total)) best = candidate;
  }
  return best;
}

/** Fewest names the line spells out before "+N". */
const maxNamed = 3;

const sourceWords: Record<FitSource, string> = {
  pantry: "passar det du har hemma",
  recipes: "passar dina recept",
  both: "passar det du brukar laga",
};

/**
 * One short phrase for all matches (Story 16.7): "passar det du har hemma"
 * when every match is in the pantry, "passar dina recept" when every one is in
 * recipes, else "passar det du brukar laga".
 */
export function fitPhrase(matches: readonly Pick<FitMatch, "source">[]): string {
  const sources = new Set(matches.map((match) => match.source));
  if (sources.size === 1) return sourceWords[[...sources][0]];
  return sourceWords.both;
}

/** "Falukorv och grädde", "Falukorv, grädde och lök", "Falukorv, grädde, lök +2"; same name once, first letter capital. */
export function matchNames(matches: readonly Pick<FitMatch, "name">[]): string {
  const names = [...new Set(matches.map((match) => match.name.toLocaleLowerCase("sv")))];
  const text =
    names.length <= 2
      ? names.join(" och ")
      : names.length === 3
        ? `${names[0]}, ${names[1]} och ${names[2]}`
        : `${names.slice(0, maxNamed).join(", ")} +${names.length - maxNamed}`;
  return text.charAt(0).toLocaleUpperCase("sv-SE") + text.slice(1);
}

/** "Falukorv och grädde passar dina recept"; with no names, the counted reason. */
export function bestStoreLine(best: Pick<BestStore, "fits" | "total" | "matches">): string {
  if (best.matches.length === 0) return bestStoreReason(best);
  return `${matchNames(best.matches)} ${fitPhrase(best.matches)}`;
}

/** "12 erbjudanden passar det du brukar laga", else "5 erbjudanden". */
export function bestStoreReason(best: Pick<BestStore, "fits" | "total">): string {
  if (best.fits > 0) return `${best.fits} ${best.fits === 1 ? "erbjudande passar" : "erbjudanden passar"} det du brukar laga`;
  return `${best.total} ${best.total === 1 ? "erbjudande" : "erbjudanden"}`;
}

const tipWords: Record<FitSource, string> = {
  pantry: "har du hemma",
  recipes: "finns i dina recept",
  both: "passar det du brukar laga",
};

/**
 * The tip over the list (Story 16.10), one sentence: with a store,
 * "Maxi passar dig bäst den här veckan: Falukorv finns i dina recept"; without
 * (only one store has offers), "Falukorv finns i dina recept". No names: the counted reason.
 */
export function bestStoreTip(best: Pick<BestStore, "fits" | "total" | "matches">, storeLabel?: string): string {
  const why =
    best.matches.length === 0
      ? bestStoreReason(best)
      : `${matchNames(best.matches)} ${new Set(best.matches.map((match) => match.source)).size === 1 ? tipWords[best.matches[0].source] : tipWords.both}`;
  return storeLabel ? `${storeLabel} passar dig bäst den här veckan: ${why}` : why;
}

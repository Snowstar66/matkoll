import { normalizeIngredientText } from "@/features/catalog";
import { offersUsed, toBuyNames, type DishLine, type OfferInfo } from "./offer-input";

// "Från dina recept" (Story 16.3): which of Pontus's own recipes use the most
// of this week's offers from a store, favourites first, counted without AI.
// Pure, so it is tested without a database.

/** At most this many of the user's own recipes are shown. */
export const maxOwnRecipes = 5;

/** A library recipe as the ranking reads it. */
export type OwnRecipe = {
  id: string;
  title: string;
  isFavorite: boolean;
  imageUrl: string | null;
  totalMinutes: number | null;
  servings: number;
  lines: DishLine[];
};

/** A recipe that uses at least one offer, with what its card says. */
export type OwnRecipeMatch = {
  id: string;
  title: string;
  isFavorite: boolean;
  imageUrl: string | null;
  totalMinutes: number | null;
  servings: number;
  /** The labels of the offers the recipe uses (offersUsed). */
  onOffer: string[];
  /** "X av Y hemma": lines at home, of all lines. */
  have: number;
  total: number;
  /** What is left to buy (toBuyNames). */
  toBuy: string[];
};

/** Points per offer ingredient; a favourite is worth 1.5 of them, a thing to buy costs 0.2, a saving adds up to 0.2 per offer. */
const perOffer = 10;
const favoriteBonus = 15;
const perBuy = 2;
const savingWeight = 2;

/**
 * The recipes that use at least one of the offers, best first, at most
 * `limit`: 10 points per offer used, 15 for a favourite, minus 2 per thing
 * left to buy, plus up to 2 per offer for its saving (100 % is 2). Ties go to
 * a favourite, then to the title and id, so the order never changes between
 * two reads. An offer is used when its catalog ingredient is a line's, or,
 * for an offer without one, when its name is a line's name (offersUsed).
 */
export function rankOwnRecipes(
  offers: readonly OfferInfo[],
  recipes: readonly OwnRecipe[],
  limit = maxOwnRecipes,
): OwnRecipeMatch[] {
  const scored = recipes.flatMap((recipe) => {
    const linked = new Set(recipe.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])));
    const onOffer = offersUsed(
      offers,
      linked,
      recipe.lines.map((line) => line.name),
    );
    if (onOffer.length === 0) return [];
    const saving = onOffer.reduce((sum, label) => {
      const best = Math.max(...offers.filter((offer) => offer.label === label).map((offer) => offer.savingPercent ?? 0), 0);
      return sum + Math.min(Math.max(best, 0), 100) / 100;
    }, 0);
    const toBuy = toBuyNames(offers, recipe.lines);
    const score = perOffer * onOffer.length + (recipe.isFavorite ? favoriteBonus : 0) - perBuy * toBuy.length + savingWeight * saving;
    const match: OwnRecipeMatch = {
      id: recipe.id,
      title: recipe.title,
      isFavorite: recipe.isFavorite,
      imageUrl: recipe.imageUrl,
      totalMinutes: recipe.totalMinutes,
      servings: recipe.servings,
      onOffer,
      have: recipe.lines.filter((line) => line.atHome).length,
      total: recipe.lines.length,
      toBuy,
    };
    return [{ match, score }];
  });
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.match.isFavorite) - Number(a.match.isFavorite) ||
        normalizeIngredientText(a.match.title).localeCompare(normalizeIngredientText(b.match.title), "sv") ||
        a.match.id.localeCompare(b.match.id),
    )
    .slice(0, limit)
    .map(({ match }) => match);
}

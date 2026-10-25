import { z } from "zod";

// The recipe library (FR-8, FR-9): what a recipe row shows, the search text
// and the filters Alla and Favoriter. Pure, so it is tested without a database.

/** A recipe as a row in the library shows it. */
export type RecipeListItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  totalMinutes: number | null;
  originalServings: number;
  isFavorite: boolean;
};

/** What searchRecipes takes: the text typed so far, at most 100 characters. */
export const recipeSearchSchema = z.string().max(100);

/** What setFavorite takes: the recipe and whether it is now a favourite. */
export const favoriteChangeSchema = z.object({ id: z.uuid(), isFavorite: z.boolean() });
export type FavoriteChange = z.infer<typeof favoriteChangeSchema>;

/** "35 min · 4 portioner", without the time when the recipe has none (or 0). */
export function recipeMetaText(totalMinutes: number | null, servings: number): string {
  const portions = `${servings} ${servings === 1 ? "portion" : "portioner"}`;
  return totalMinutes ? `${totalMinutes} min · ${portions}` : portions;
}

export const RECIPE_FILTERS = ["all", "favorites"] as const;
export type RecipeFilter = (typeof RECIPE_FILTERS)[number];

/** A stored filter choice; anything else, or nothing, is Alla. */
export function parseRecipeFilter(value: unknown): RecipeFilter {
  return value === "favorites" ? "favorites" : "all";
}

/** The recipes the filter shows, in the same order. `isFavorite` says whether a recipe is a favourite now. */
export function filterRecipes<T extends { id: string }>(
  recipes: readonly T[],
  filter: RecipeFilter,
  isFavorite: (recipe: T) => boolean,
): T[] {
  return filter === "favorites" ? recipes.filter(isFavorite) : [...recipes];
}

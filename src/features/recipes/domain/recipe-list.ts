import { z } from "zod";
import { recipeStatus, type PantrySnapshot, type StatusLine } from "@/features/pantry";

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
  /**
   * N in "Saknar N varor" for the recipe's own servings; 0 is "Kan lagas nu"
   * (pantry.recipeStatus). `null` when the pantry could not be read: the row
   * is shown without a status.
   */
  missingCount: number | null;
};

/** A library row as the queries read it: without status, with the lines the status is counted from. */
export type RecipeListRow = Omit<RecipeListItem, "missingCount"> & { lines: StatusLine[] };

/**
 * The rows with their status against the whole pantry, for the recipes' own
 * servings (AD-7: the library never scales), in the same order. Without a
 * snapshot (the pantry could not be read) every row has no status.
 */
export function withStatus(rows: readonly RecipeListRow[], snapshot: PantrySnapshot | null): RecipeListItem[] {
  return rows.map(({ lines, ...row }) => ({
    ...row,
    missingCount: snapshot
      ? recipeStatus({ servings: row.originalServings, lines }, row.originalServings, snapshot).missingCount
      : null,
  }));
}

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

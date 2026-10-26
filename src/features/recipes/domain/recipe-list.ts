import { z } from "zod";
import { recipeStatus, type PantrySnapshot, type StatusLine } from "@/features/pantry";

// The recipe library (FR-8, FR-9, FR-22): what a recipe row shows, the search
// text and the filters Alla, Favoriter and Kan lagas nu. Pure, so it is tested
// without a database.

/** A recipe as a row in the library shows it. */
export type RecipeListItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  totalMinutes: number | null;
  originalServings: number;
  isFavorite: boolean;
  /** When the recipe was saved (ISO 8601, as the database gives it); the library is newest first. */
  createdAt: string;
  /**
   * N in "Saknar N varor" for the recipe's own servings; 0 is "Kan lagas nu"
   * (pantry.recipeStatus). `null` when the pantry could not be read: the row
   * is shown without a status.
   */
  missingCount: number | null;
};

/**
 * A recipe line as the queries read it: what the status is counted from, and
 * the written text, which the shopping list shows for a line without a
 * catalog ingredient (decision 2026-10-26).
 */
export type RecipeRowLine = StatusLine & { originalText: string };

/** A library row as the queries read it: without status, with the lines the status is counted from. */
export type RecipeListRow = Omit<RecipeListItem, "missingCount"> & { lines: RecipeRowLine[] };

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

/**
 * The library as the Recept page and its search get it: the rows with their
 * status, and whether the pantry could not be read (`pantrySnapshotOrNull`
 * gave `null`), in which case no row has a status and Kan lagas nu cannot
 * rank them.
 */
export type RecipeLibrary = { recipes: RecipeListItem[]; pantryUnavailable: boolean };

/** withStatus, with whether the pantry could not be read. */
export function toLibrary(rows: readonly RecipeListRow[], snapshot: PantrySnapshot | null): RecipeLibrary {
  return { recipes: withStatus(rows, snapshot), pantryUnavailable: snapshot === null };
}

/** What searchRecipes takes: the text typed so far, at most 100 characters. */
export const recipeSearchSchema = z.string().max(100);

/** What setFavorite takes: the recipe and whether it is now a favourite. */
export const favoriteChangeSchema = z.object({ id: z.uuid(), isFavorite: z.boolean() });
export type FavoriteChange = z.infer<typeof favoriteChangeSchema>;

/** "35 min", or `null` when the recipe has no time (or 0). */
export function recipeTimeText(totalMinutes: number | null): string | null {
  return totalMinutes ? `${totalMinutes} min` : null;
}

/** "35 min · 4 portioner", without the time when the recipe has none (or 0). */
export function recipeMetaText(totalMinutes: number | null, servings: number): string {
  const portions = `${servings} ${servings === 1 ? "portion" : "portioner"}`;
  const time = recipeTimeText(totalMinutes);
  return time ? `${time} · ${portions}` : portions;
}

export const RECIPE_FILTERS = ["all", "favorites", "cookable"] as const;
export type RecipeFilter = (typeof RECIPE_FILTERS)[number];

/** A stored filter choice; anything else, or nothing, is Alla. */
export function parseRecipeFilter(value: unknown): RecipeFilter {
  return RECIPE_FILTERS.find((filter) => filter === value) ?? "all";
}

/** What filterRecipes needs of a row. */
type FilterableRecipe = { id: string; createdAt: string; missingCount: number | null };

/**
 * The recipes the filter shows. Alla keeps every recipe in the given order
 * (newest first), Favoriter only the favourites in that order; `isFavorite`
 * says whether a recipe is a favourite now.
 *
 * Kan lagas nu keeps every recipe too, ranked by `missingCount` (N from
 * pantry.recipeStatus, AD-7), fewest first, so the ones that can be cooked now
 * come first. Equal N are newest first (`createdAt`), then by id, as the
 * server orders the library. Rows without a status (`missingCount` not a
 * finite number of at least 0) come last, in the same order among themselves.
 */
export function filterRecipes<T extends FilterableRecipe>(
  recipes: readonly T[],
  filter: RecipeFilter,
  isFavorite: (recipe: T) => boolean,
): T[] {
  if (filter === "favorites") return recipes.filter(isFavorite);
  // A copy, so the input is unchanged.
  if (filter === "cookable") return [...recipes].sort(fewestMissingFirst);
  return [...recipes];
}

/** N to rank by, or `null` for a row without a usable status. */
function rankOf(missingCount: unknown): number | null {
  return typeof missingCount === "number" && Number.isFinite(missingCount) && missingCount >= 0 ? missingCount : null;
}

/** Fewest missing first, rows without a status last; then newest first, then by id. */
function fewestMissingFirst(a: FilterableRecipe, b: FilterableRecipe): number {
  const rankA = rankOf(a.missingCount);
  const rankB = rankOf(b.missingCount);
  if (rankA !== rankB) {
    if (rankA === null) return 1;
    if (rankB === null) return -1;
    return rankA - rankB;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

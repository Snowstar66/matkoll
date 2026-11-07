import { z } from "zod";
import {
  noStaples,
  recipeStatus,
  type PantrySnapshot,
  type SelectedSite,
  type StapleRules,
  type StatusLine,
} from "@/features/pantry";
import { recipeCategories, type RecipeCategory } from "./recipe-category";

// The recipe library (FR-8, FR-9, FR-22): what a recipe row shows, the search
// text and the filters Alla, Favoriter, Kan lagas nu and Erbjudanden. Pure, so it is tested
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
  /**
   * The names of the missing ingredients (Story 4.3), in the recipe's order,
   * for the badge's accessible name; empty when none are known.
   */
  missingNames?: readonly string[];
  /** Story 1.17: worked out from the title, the lines and the time (recipeCategories); none when not given. */
  categories?: readonly RecipeCategory[];
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
 * snapshot (the pantry could not be read) every row has no status. The
 * household's Basvaror count as at home (pantry.isStaple).
 */
export function withStatus(
  rows: readonly RecipeListRow[],
  snapshot: PantrySnapshot | null,
  names: Readonly<Record<string, string>> = {},
  staples: StapleRules = noStaples,
): RecipeListItem[] {
  return rows.map(({ lines, ...row }) => {
    const categories = recipeCategories({
      title: row.title,
      ingredients: lines.map((line) => line.originalText),
      totalMinutes: row.totalMinutes,
    });
    if (!snapshot) return { ...row, categories, missingCount: null };
    const status = recipeStatus({ servings: row.originalServings, lines }, row.originalServings, snapshot, staples);
    return {
      ...row,
      categories,
      missingCount: status.missingCount,
      missingNames: status.missingIngredientIds.flatMap((id) => (names[id] ? [names[id]] : [])),
    };
  });
}

/** The ids of the ingredients any of the rows is missing, for looking their names up (Story 4.3). */
export function missingIngredientIds(
  rows: readonly RecipeListRow[],
  snapshot: PantrySnapshot | null,
  staples: StapleRules = noStaples,
): string[] {
  if (!snapshot) return [];
  const ids = new Set<string>();
  for (const { originalServings, lines } of rows) {
    for (const id of recipeStatus({ servings: originalServings, lines }, originalServings, snapshot, staples).missingIngredientIds) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * The library as the Recept page and its search get it: the rows with their
 * status, and whether the pantry could not be read (pantry.getPantryForStatus
 * gave `null`), in which case no row has a status and Kan lagas nu cannot
 * rank them. `site` is the place the status was counted against, for the
 * line "Boende: Stugan" in Kan lagas nu (AD-24); `null` without a status, or
 * when the place could not be read.
 */
export type RecipeLibrary = { recipes: RecipeListItem[]; pantryUnavailable: boolean; site: SelectedSite | null };

/** withStatus, with whether the pantry could not be read and the place it is of (none without a status). */
export function toLibrary(
  rows: readonly RecipeListRow[],
  snapshot: PantrySnapshot | null,
  site: SelectedSite | null,
  names: Readonly<Record<string, string>> = {},
  staples: StapleRules = noStaples,
): RecipeLibrary {
  return {
    recipes: withStatus(rows, snapshot, names, staples),
    pantryUnavailable: snapshot === null,
    site: snapshot ? site : null,
  };
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

export const RECIPE_FILTERS = ["all", "favorites", "cookable", "offers"] as const;
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
 * Kan lagas nu keeps only the recipes with `missingCount` 0 (N from
 * pantry.recipeStatus, AD-7; Basvaror count as home), in the given order.
 * Rows without a status are not cookable and are left out.
 */
export function filterRecipes<T extends FilterableRecipe>(
  recipes: readonly T[],
  filter: RecipeFilter,
  isFavorite: (recipe: T) => boolean,
): T[] {
  if (filter === "favorites") return recipes.filter(isFavorite);
  if (filter === "cookable") return recipes.filter((recipe) => rankOf(recipe.missingCount) === 0);
  return [...recipes];
}

/** The most items a recipe may miss and still be listed under "Nästan" in Kan lagas nu. */
export const NEARLY_MAX_MISSING = 2;

/**
 * The recipes under "Nästan (N)" in Kan lagas nu: missing 1 or 2 items, fewest
 * missing first, equal counts in the given order. Nothing missing 3 or more.
 */
export function nearlyCookable<T extends { missingCount: number | null }>(recipes: readonly T[]): T[] {
  return recipes
    .filter((recipe) => {
      const rank = rankOf(recipe.missingCount);
      return rank !== null && rank >= 1 && rank <= NEARLY_MAX_MISSING;
    })
    .sort((a, b) => (a.missingCount as number) - (b.missingCount as number));
}

/**
 * The filter Erbjudanden (Story 9.3): only the recipes with at least one offer
 * on a main ingredient (`tags` by recipe id, from suggestions.recipeOfferTags),
 * the most offers first, then the fewest missing (rows without a status last),
 * then newest first and by id like Kan lagas nu. A copy, so the input is unchanged.
 */
export function rankByOffers<T extends FilterableRecipe>(recipes: readonly T[], tags: Readonly<Record<string, readonly string[]>>): T[] {
  const count = (recipe: T) => (Object.hasOwn(tags, recipe.id) ? tags[recipe.id].length : 0);
  return recipes.filter((recipe) => count(recipe) > 0).sort((a, b) => count(b) - count(a) || fewestMissingFirst(a, b));
}

/** The most offer tags a card shows; the rest is "+N". */
export const maxOfferTags = 2;

/** The tags a card shows (the first two) and how many more there are. */
export function offerTagsShown(tags: readonly string[]): { shown: string[]; more: number } {
  return { shown: tags.slice(0, maxOfferTags), more: Math.max(tags.length - maxOfferTags, 0) };
}

/** The one line of a recipe's offers: "Erbjudande: falukorv, grädde +1" (the first two and how many more). */
export function offerTagsLine(tags: readonly string[]): string {
  const { shown, more } = offerTagsShown(tags);
  const names = shown.map((tag) => `${tag.charAt(0).toLowerCase()}${tag.slice(1)}`);
  return `Erbjudande: ${names.join(", ")}${more > 0 ? ` +${more}` : ""}`;
}

/** Why the filter Erbjudanden suggests what it does. */
export const extraPriceReason = "Förslag för att varorna är på erbjudande den här veckan.";

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

/** The recipes in one category; no category keeps them all. */
export function filterByCategory<T extends { categories?: readonly RecipeCategory[] }>(
  recipes: readonly T[],
  category: RecipeCategory | null,
): T[] {
  return category === null ? [...recipes] : recipes.filter((recipe) => recipe.categories?.includes(category));
}

/** How the library is ordered (Story 1.16); the first is the default. */
export const RECIPE_SORTS = ["newest", "fastest", "mostHome", "alphabetical"] as const;
export type RecipeSort = (typeof RECIPE_SORTS)[number];

/** The sort sheet's options, in order, with the text the button shows for the choice. */
export const recipeSortLabels: Record<RecipeSort, string> = {
  newest: "Senast tillagda",
  fastest: "Snabbast",
  mostHome: "Mest hemma",
  alphabetical: "A–Ö",
};

/** A stored sort choice; anything else, or nothing, is Senast tillagda. */
export function parseRecipeSort(value: unknown): RecipeSort {
  return RECIPE_SORTS.find((sort) => sort === value) ?? "newest";
}

/** How the library shows its recipes (Story 1.16): as cards or as a compact list. */
export const RECIPE_VIEWS = ["cards", "compact"] as const;
export type RecipeView = (typeof RECIPE_VIEWS)[number];

/** A stored view choice; anything else, or nothing, is the cards. */
export function parseRecipeView(value: unknown): RecipeView {
  return RECIPE_VIEWS.find((view) => view === value) ?? "cards";
}

/** What sortRecipes needs of a row. */
type SortableRecipe = FilterableRecipe & { title: string; totalMinutes: number | null };

/** Shortest time first; a recipe without a time (or 0) last. */
function fastestFirst(a: SortableRecipe, b: SortableRecipe): number {
  const minutesA = a.totalMinutes || null;
  const minutesB = b.totalMinutes || null;
  if (minutesA === minutesB) return 0;
  if (minutesA === null) return 1;
  if (minutesB === null) return -1;
  return minutesA - minutesB;
}

/** Newest first, then by id: the server's order. */
function newestFirst(a: FilterableRecipe, b: FilterableRecipe): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The recipes in the chosen order; equal ones are newest first. Snabbast is
 * the shortest time first, Mest hemma the fewest missing first (rows without
 * a status last), A–Ö by title in Swedish order (å, ä, ö after z).
 */
export function sortRecipes<T extends SortableRecipe>(recipes: readonly T[], sort: RecipeSort): T[] {
  const copy = [...recipes];
  if (sort === "mostHome") return copy.sort(fewestMissingFirst);
  const primary: (a: T, b: T) => number =
    sort === "fastest" ? fastestFirst : sort === "alphabetical" ? (a, b) => a.title.localeCompare(b.title, "sv") : () => 0;
  return copy.sort((a, b) => primary(a, b) || newestFirst(a, b));
}

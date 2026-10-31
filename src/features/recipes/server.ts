import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getIngredientNames } from "@/features/catalog/server";
import { snapshotFor, type PantrySnapshot, type SelectedSite } from "@/features/pantry";
import { getPantryForStatus } from "@/features/pantry/server";
import { createClient } from "@/lib/supabase/server";
import {
  getRecipe as getRecipeIn,
  getRecipesByIdsIn,
  listRecipes as listRecipesIn,
  type ListOptions,
} from "./data/queries";
import { missingNames } from "./data/missing-names";
import {
  toLibrary,
  withStatus,
  type RecipeLibrary,
  type RecipeListItem,
  type RecipeListRow,
} from "./domain/recipe-list";
import type { SavedRecipe } from "./domain/saved-recipe";

// Server-only entry (AD-1): read functions and server functions for AI flows.
export { saveRecipe } from "./actions/save-recipe";
export { importRecipe, prepareImport, type ImportContext } from "./actions/import-recipe";

/**
 * Server Action for searching the library while typing. A page passes it to a
 * client component of another module (Lägg till rätt in Matsedel), which
 * cannot import this module's actions (AD-1).
 */
export { searchRecipes } from "./actions/search-recipes";

/** What getRecipe throws when Supabase fails; never user data. */
export { RecipeDataError } from "./data/client";

const recipeIdSchema = z.guid();

/**
 * The signed-in user's recipe with steps, lines and ingredient names, or
 * `null` for an id that is not a uuid or not one of the user's recipes. For
 * pages, after requireUserOrRedirect, inside <Suspense> (AD-18). Memoised per
 * request, so the page and its metadata read the recipe once.
 */
export const getRecipe = cache(async (id: string): Promise<SavedRecipe | null> => {
  if (!recipeIdSchema.safeParse(id).success) return null;
  return getRecipeIn(await createClient(), id, getIngredientNames);
});

/**
 * The signed-in user's recipes as library rows, newest first, each with its
 * status against the pantry for its own servings ("Kan lagas nu" or "Saknar N
 * varor", AD-7), or without a status when the pantry cannot be read; only
 * favourites with `favoritesOnly`. For pages, after requireUserOrRedirect,
 * inside <Suspense> (AD-18). Throws RecipeDataError.
 */
export async function listRecipes(options?: ListOptions): Promise<RecipeListItem[]> {
  const [rows, { snapshot }] = await Promise.all([listRecipesIn(await createClient(), options), getPantryForStatus()]);
  return withStatus(rows, snapshot, await missingNames(rows, snapshot));
}

/**
 * The library for the Recept page: listRecipes' rows, whether the pantry
 * could not be read, so Kan lagas nu can say why it does not rank them, and
 * the place the status was counted against, for the line "Boende: Stugan"
 * (AD-24). For pages, after requireUserOrRedirect, inside <Suspense>
 * (AD-18). Throws RecipeDataError.
 */
export async function listLibrary(): Promise<RecipeLibrary> {
  const [rows, { snapshot, site }] = await Promise.all([listRecipesIn(await createClient()), getPantryForStatus()]);
  return toLibrary(rows, snapshot, site, await missingNames(rows, snapshot));
}

/**
 * The recipe (as getRecipe) and the signed-in user's pantry for its
 * ingredients, for the recipe view, which counts the status for the chosen
 * servings in the browser (AD-7); only the recipe's own ingredients go to the
 * browser. An id that is not a uuid is `null` at once, without reading
 * anything; for a uuid the recipe and the pantry are read in parallel.
 * `snapshot` is `null` when the pantry cannot be read (logged as
 * `pantry_unavailable`), and then `site` is `null` too: the recipe is shown
 * without status and without the line. `site` is the place the pantry is of
 * (pantry.getPantryForStatus), for "Boende: Stugan" under "X av Y hemma"
 * (AD-24). `null` for a
 * recipe getRecipe does not find. Throws RecipeDataError.
 */
export async function getRecipeWithPantry(
  id: string,
): Promise<{ recipe: SavedRecipe; snapshot: PantrySnapshot | null; site: SelectedSite | null } | null> {
  if (!recipeIdSchema.safeParse(id).success) return null;
  const [recipe, { snapshot, site }] = await Promise.all([getRecipe(id), getPantryForStatus()]);
  if (!recipe) return null;
  return {
    recipe,
    snapshot: snapshot ? snapshotFor(snapshot, recipe.lines.map((line) => line.ingredientId)) : null,
    site,
  };
}

/**
 * The signed-in user's recipes among `ids`, each with its title, image, time,
 * own servings and the lines its status is counted from (`ingredientId`,
 * `amount`, `unit`, `isVague`), for the meal plan and the shopping list
 * (AD-1). Ids that are not the user's recipes are left out; the order is not
 * kept. Throws RecipeDataError.
 */
export async function getRecipesByIds(ids: readonly string[]): Promise<RecipeListRow[]> {
  return getRecipesByIdsIn(await createClient(), ids);
}

/**
 * How many of the signed-in user's recipes use each catalog ingredient (by
 * id), for "Veckans bästa butik" (Story 9.14). One read of the library's
 * rows, which the library page reads anyway. Throws RecipeDataError.
 */
export async function getIngredientRecipeCounts(): Promise<Map<string, number>> {
  const rows = await listRecipesIn(await createClient());
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const id of new Set(row.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])))) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The signed-in user's whole library as rows with their lines, newest first,
 * for the ranking of own recipes against offers (Story 16.3). For server
 * code after requireUser. Throws RecipeDataError.
 */
export async function listRecipeRows(): Promise<RecipeListRow[]> {
  return listRecipesIn(await createClient());
}

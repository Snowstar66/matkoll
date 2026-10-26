import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getIngredientNames } from "@/features/catalog/server";
import { snapshotFor, type PantrySnapshot } from "@/features/pantry";
import { createClient } from "@/lib/supabase/server";
import { pantrySnapshotOrNull } from "./data/pantry-snapshot";
import {
  getRecipe as getRecipeIn,
  getRecipesByIdsIn,
  listRecipes as listRecipesIn,
  type ListOptions,
} from "./data/queries";
import { withStatus, type RecipeListItem, type RecipeListRow } from "./domain/recipe-list";
import type { SavedRecipe } from "./domain/saved-recipe";

// Server-only entry (AD-1): read functions and server functions for AI flows.
export { importRecipe } from "./actions/import-recipe";

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
  const [rows, snapshot] = await Promise.all([listRecipesIn(await createClient(), options), pantrySnapshotOrNull()]);
  return withStatus(rows, snapshot);
}

/**
 * The recipe (as getRecipe) and the signed-in user's pantry for its
 * ingredients, for the recipe view, which counts the status for the chosen
 * servings in the browser (AD-7); only the recipe's own ingredients go to the
 * browser. An id that is not a uuid is `null` at once, without reading
 * anything; for a uuid the recipe and the pantry are read in parallel.
 * `snapshot` is `null` when the pantry cannot be read (logged as
 * `pantry_unavailable`): the recipe is shown without status. `null` for a
 * recipe getRecipe does not find. Throws RecipeDataError.
 */
export async function getRecipeWithPantry(
  id: string,
): Promise<{ recipe: SavedRecipe; snapshot: PantrySnapshot | null } | null> {
  if (!recipeIdSchema.safeParse(id).success) return null;
  const [recipe, snapshot] = await Promise.all([getRecipe(id), pantrySnapshotOrNull()]);
  if (!recipe) return null;
  return {
    recipe,
    snapshot: snapshot ? snapshotFor(snapshot, recipe.lines.map((line) => line.ingredientId)) : null,
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

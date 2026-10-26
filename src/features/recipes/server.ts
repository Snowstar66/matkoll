import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getIngredientNames } from "@/features/catalog/server";
import { recipeStatus, type RecipeStatus } from "@/features/pantry";
import { createClient } from "@/lib/supabase/server";
import { pantrySnapshotOrNull } from "./data/pantry-snapshot";
import { getRecipe as getRecipeIn, listRecipes as listRecipesIn, type ListOptions } from "./data/queries";
import { withStatus, type RecipeListItem } from "./domain/recipe-list";
import type { SavedRecipe } from "./domain/saved-recipe";

// Server-only entry (AD-1): read functions and server functions for AI flows.
export { importRecipe } from "./actions/import-recipe";

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
 * The recipe (as getRecipe) and its status against the signed-in user's
 * pantry for its own servings: N and each line's coverage by line id (AD-7).
 * The recipe and the pantry are read in parallel; `status` is `null` when the
 * pantry cannot be read, and the recipe is shown without it. `null` for a
 * recipe getRecipe does not find. For the recipe view. Throws RecipeDataError.
 */
export async function getRecipeWithStatus(
  id: string,
): Promise<{ recipe: SavedRecipe; status: RecipeStatus | null } | null> {
  const [recipe, snapshot] = await Promise.all([getRecipe(id), pantrySnapshotOrNull()]);
  if (!recipe) return null;
  return { recipe, status: snapshot ? recipeStatus(recipe, recipe.servings, snapshot) : null };
}

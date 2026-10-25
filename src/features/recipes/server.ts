import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getIngredientNames } from "@/features/catalog/server";
import { createClient } from "@/lib/supabase/server";
import { getRecipe as getRecipeIn, listRecipes as listRecipesIn, type ListOptions } from "./data/queries";
import type { RecipeListItem } from "./domain/recipe-list";
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
 * The signed-in user's recipes as library rows, newest first; only favourites
 * with `favoritesOnly`. For pages, after requireUserOrRedirect, inside
 * <Suspense> (AD-18). Throws RecipeDataError.
 */
export async function listRecipes(options?: ListOptions): Promise<RecipeListItem[]> {
  return listRecipesIn(await createClient(), options);
}

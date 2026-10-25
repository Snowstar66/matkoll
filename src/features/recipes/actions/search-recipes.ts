"use server";

import { searchText } from "@/features/catalog";
import { CatalogDataError, findIngredientIds } from "@/features/catalog/server";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { searchRecipesIn } from "../data/queries";
import { recipeSearchSchema, type RecipeListItem } from "../domain/recipe-list";

/**
 * Searches the signed-in user's recipe library while Pontus types (AD-1: a
 * read action, allowed for search*): by title, by the lines' original text,
 * and by the catalog ingredients whose name or synonym contains the text.
 * Newest first. The library filters Favoriter itself, and shows its server
 * list for empty text; empty text gives no recipes here. Fails with
 * `unauthorized`, `validation` or `recipe_search_failed`.
 */
export async function searchRecipes(query: string): Promise<Result<RecipeListItem[]>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = recipeSearchSchema.safeParse(query);
  if (!parsed.success) return fail("validation");
  const text = searchText(parsed.data);

  try {
    const ingredientIds = await findIngredientIds(text);
    return ok(await searchRecipesIn(await createClient(), { text, ingredientIds }));
  } catch (error) {
    if (error instanceof CatalogDataError) {
      console.error("recipe_search_failed", { reason: `catalog_${error.code}` });
      return fail("recipe_search_failed");
    }
    if (error instanceof RecipeDataError) {
      console.error("recipe_search_failed", { reason: error.detail });
      return fail("recipe_search_failed");
    }
    throw error;
  }
}

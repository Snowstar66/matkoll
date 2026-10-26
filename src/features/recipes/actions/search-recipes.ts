"use server";

import { searchText } from "@/features/catalog";
import { CatalogDataError, findIngredientIds } from "@/features/catalog/server";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { pantrySnapshotOrNull } from "../data/pantry-snapshot";
import { searchRecipesIn } from "../data/queries";
import { recipeSearchSchema, toLibrary, type RecipeLibrary, type RecipeListItem } from "../domain/recipe-list";

/**
 * Searches the signed-in user's recipe library while Pontus types (AD-1: a
 * read action, allowed for search*): by title, by the lines' original text,
 * and by the catalog ingredients whose name or synonym contains the text.
 * Newest first, each with its status against the pantry, as on the server
 * list (none when the pantry cannot be read; the pantry is not read when
 * nothing is found). The library filters Favoriter itself, and shows its
 * server list for empty text; empty text gives no recipes here. Fails with
 * `unauthorized`, `validation` or `recipe_search_failed`.
 */
export async function searchRecipes(query: string): Promise<Result<RecipeListItem[]>> {
  const found = await search(query);
  return found.ok ? ok(found.data.recipes) : found;
}

/**
 * searchRecipes for the Recept page's library: the same recipes, and whether
 * the pantry could not be read (never when nothing is found, since the pantry
 * is not read then), so Kan lagas nu can say why it does not rank them.
 */
export async function searchLibrary(query: string): Promise<Result<RecipeLibrary>> {
  return search(query);
}

async function search(query: string): Promise<Result<RecipeLibrary>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = recipeSearchSchema.safeParse(query);
  if (!parsed.success) return fail("validation");
  const text = searchText(parsed.data);

  try {
    const ingredientIds = await findIngredientIds(text);
    const rows = await searchRecipesIn(await createClient(), { text, ingredientIds });
    if (rows.length === 0) return ok({ recipes: [], pantryUnavailable: false });
    // A pantry that cannot be read gives the recipes without status, never a failed search.
    return ok(toLibrary(rows, await pantrySnapshotOrNull()));
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

import "server-only";
import type { RecipeDraft } from "../domain/recipe-draft";
import { toSaveRecipeArgs } from "../domain/saved-recipe";
import { RecipeDataError, type RecipesDb } from "./client";

/**
 * Saves a new recipe with its steps and lines in one transaction (the Postgres
 * function save_recipe, as the caller, so RLS applies) as `recipeId` and
 * returns the id. When the user already has a recipe with that id (the same
 * preview saved again), nothing is written and the id is returned.
 * `ingredientIds[i]` is the catalog id of `draft.lines[i]` from
 * catalog.commitIngredients. Either everything is saved or nothing.
 * Throws RecipeDataError.
 */
export async function saveRecipeIn(
  db: RecipesDb,
  recipeId: string,
  draft: RecipeDraft,
  ingredientIds: readonly (string | null)[],
): Promise<string> {
  const { data, error } = await db.rpc("save_recipe", toSaveRecipeArgs(recipeId, draft, ingredientIds));
  if (error) throw new RecipeDataError(`save_failed ${error.code}`);
  if (!data) throw new RecipeDataError("missing_id");
  return data;
}

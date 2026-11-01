import "server-only";
import type { RecipeDraft } from "../domain/recipe-draft";
import { toUpdateRecipeArgs } from "../domain/saved-recipe";
import { RecipeDataError, type RecipesDb } from "./client";

/** What the saved recipe holds that a change is checked against. */
export type SavedRecipeRefs = {
  /** recipe.updated_at, exactly as the database gives it. */
  updatedAt: string;
  /** The catalog ingredient of each saved line, by line id. */
  lines: Map<string, string | null>;
  /** The ids of the saved steps. */
  stepIds: Set<string>;
};

/**
 * The recipe's updated_at, its lines' ingredients and its step ids, or `null`
 * when the signed-in user has no recipe with that id (RLS hides other users'
 * recipes). Throws RecipeDataError.
 */
export async function savedRecipeRefsIn(db: RecipesDb, id: string): Promise<SavedRecipeRefs | null> {
  const { data, error } = await db
    .from("recipe")
    .select("id, updated_at, recipe_ingredient(id, ingredient_id), recipe_step(id)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new RecipeDataError(`query_failed ${error.code}`);
  if (!data) return null;
  return {
    updatedAt: data.updated_at,
    lines: new Map(data.recipe_ingredient.map((line) => [line.id, line.ingredient_id])),
    stepIds: new Set(data.recipe_step.map((step) => step.id)),
  };
}

/** The Postgres code update_recipe raises when the recipe changed after the form was filled. */
const conflictCode = "MK409";

/**
 * Changes the saved recipe `id` to the draft in one transaction (the Postgres
 * function update_recipe, as the caller, so RLS applies). Lines and steps
 * with an id keep it, new ones are added, and those left out are deleted.
 * `ingredientIds[i]` is the catalog id of `draft.lines[i]` from
 * catalog.commitIngredients, and `expectedUpdatedAt` the recipe's updated_at
 * as the form read it. Either everything changes or nothing: "not_found" when
 * the user has no recipe with that id, "conflict" when it changed since.
 * Throws RecipeDataError.
 */
export async function updateRecipeIn(
  db: RecipesDb,
  id: string,
  draft: RecipeDraft,
  ingredientIds: readonly (string | null)[],
  expectedUpdatedAt: string,
): Promise<"updated" | "not_found" | "conflict"> {
  const { data, error } = await db.rpc("update_recipe", toUpdateRecipeArgs(id, draft, ingredientIds, expectedUpdatedAt));
  if (error?.code === conflictCode) return "conflict";
  if (error) throw new RecipeDataError(`update_failed ${error.code}`);
  return data === null ? "not_found" : "updated";
}

/**
 * Deletes the recipe `id`, with its steps and lines (on delete cascade). RLS
 * limits it to the signed-in user's household (Story 21.2a: any member's
 * recipe). Returns false when the household has no recipe with that id
 * (another household's, or already deleted), and then nothing changes.
 * Throws RecipeDataError.
 */
export async function deleteRecipeIn(db: RecipesDb, id: string): Promise<boolean> {
  const { data, error } = await db.from("recipe").delete().eq("id", id).select("id");
  if (error) throw new RecipeDataError(`delete_failed ${error.code}`);
  return data.length > 0;
}

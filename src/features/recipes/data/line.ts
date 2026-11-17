import "server-only";
import { RecipeDataError, type RecipesDb } from "./client";

/** The Postgres code set_recipe_line raises when the recipe changed after it was read (as update_recipe). */
const conflictCode = "MK409";

/** What one line changes to: struck or not, and/or its amount for the recipe's own servings. */
export type LineChange = { isStruck?: boolean; amount?: number };

/**
 * Strikes or restores one line of the recipe, or changes its amount (the Postgres function set_recipe_line, as
 * the caller, so RLS applies), in one transaction against the recipe's updated_at as the page read it.
 * Returns the recipe's new updated_at, "not_found" when the household has no such recipe or line, "conflict"
 * when the recipe changed since. Throws RecipeDataError.
 */
export async function setRecipeLineIn(
  db: RecipesDb,
  recipeId: string,
  lineId: string,
  expectedUpdatedAt: string,
  change: LineChange,
): Promise<{ updatedAt: string } | "not_found" | "conflict"> {
  // The generated types say non-null; the function reads null as "leave as it is".
  const { data, error } = await db.rpc("set_recipe_line", {
    target_recipe: recipeId,
    target_line: lineId,
    expected_updated_at: expectedUpdatedAt,
    new_is_struck: (change.isStruck ?? null) as boolean,
    new_amount: (change.amount ?? null) as number,
  });
  if (error?.code === conflictCode) return "conflict";
  if (error) throw new RecipeDataError(`line_failed ${error.code}`);
  return data === null ? "not_found" : { updatedAt: data };
}

/**
 * Byt ut ingrediens: replaces one line's ingredient and text (`ingredientId` and `text`; the amount and unit stay), or
 * with `ingredientId` null puts back what the line was before it was replaced (the Postgres function
 * replace_recipe_line, as the caller, in one transaction against the recipe's updated_at as the page read it).
 * Returns the recipe's new updated_at, "not_found" when the household has no such recipe, line or ingredient,
 * "conflict" when the recipe changed since. Throws RecipeDataError.
 */
export async function replaceRecipeLineIn(
  db: RecipesDb,
  recipeId: string,
  lineId: string,
  expectedUpdatedAt: string,
  replacement: { ingredientId: string; text: string } | null,
): Promise<{ updatedAt: string } | "not_found" | "conflict"> {
  // The generated types say non-null; the function reads null as "put back".
  const { data, error } = await db.rpc("replace_recipe_line", {
    target_recipe: recipeId,
    target_line: lineId,
    expected_updated_at: expectedUpdatedAt,
    new_ingredient: (replacement?.ingredientId ?? null) as string,
    new_text: (replacement?.text ?? null) as string,
  });
  if (error?.code === conflictCode) return "conflict";
  if (error) throw new RecipeDataError(`line_failed ${error.code}`);
  return data === null ? "not_found" : { updatedAt: data };
}

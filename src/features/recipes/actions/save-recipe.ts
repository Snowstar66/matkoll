"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, commitIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { saveRecipeIn } from "../data/save";
import { recipeDraftSchema, type RecipeDraft } from "../domain/recipe-draft";

const recipeIdSchema = z.uuid();

/**
 * "Spara recept": the only way a new recipe is written (AD-2, AD-10). The
 * catalog first creates new ingredients and saves corrected matches as
 * synonyms (AD-6), then save_recipe writes the recipe, its steps and lines in
 * one transaction. The two are separate modules, so they are not one
 * transaction (AD-1): if the recipe fails, saving again reuses the
 * ingredients already created. `recipeId` is made by the client with the
 * preview, so saving the same preview again (a lost answer, then "Försök
 * igen") returns the recipe already saved instead of a copy. Fails with
 * `unauthorized`, `validation` or `recipe_save_failed`.
 */
export async function saveRecipe(draft: RecipeDraft, recipeId: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = recipeDraftSchema.safeParse(draft);
  if (!parsed.success || !recipeIdSchema.safeParse(recipeId).success) return fail("validation");
  const valid = parsed.data;

  try {
    const ingredientIds = await commitIngredients(
      valid.lines.map((line) => ({ text: line.originalText, ingredient: line.ingredient })),
    );
    const id = await saveRecipeIn(await createClient(), recipeId, valid, ingredientIds);
    revalidateFor("recipe");
    return ok({ id });
  } catch (error) {
    if (error instanceof CatalogDataError) {
      console.error("recipe_save_failed", { reason: `catalog_${error.code}` });
      return fail("recipe_save_failed");
    }
    if (error instanceof RecipeDataError) {
      console.error("recipe_save_failed", { reason: error.detail });
      return fail("recipe_save_failed");
    }
    throw error;
  }
}

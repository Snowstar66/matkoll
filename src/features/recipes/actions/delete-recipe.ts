"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { detachRecipe, MealPlanDataError } from "@/features/mealplan/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { deleteRecipeIn } from "../data/update";

const recipeIdSchema = z.uuid();

/**
 * "Ta bort recept" (FR-10, Story 1.11), after Pontus has confirmed it: deletes
 * the recipe with its steps and lines, for good. The catalog stays. Another
 * user's recipe, or one already gone, changes nothing and counts as done.
 * First mealplan.detachRecipe takes the recipe off the current meal plan
 * (AD-20); earlier plans keep the dish, without the recipe. When that fails,
 * the recipe is not deleted. Fails with `unauthorized`, `validation` or
 * `recipe_delete_failed`.
 */
export async function deleteRecipe(id: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!recipeIdSchema.safeParse(id).success) return fail("validation");

  try {
    // No row for this household is success too: the recipe is gone either way,
    // so a retry after a lost answer ends where Pontus wanted, and another
    // household's recipe is never touched (RLS, Story 21.2a).
    await detachRecipe(id);
    await deleteRecipeIn(await createClient(), id);
    revalidateFor("recipe");
    return ok({ id });
  } catch (error) {
    if (!(error instanceof RecipeDataError || error instanceof MealPlanDataError)) throw error;
    console.error("recipe_delete_failed", { reason: error.detail });
    return fail("recipe_delete_failed");
  }
}

"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { restorePlanRecipeIn } from "../data/write";
import { planRecipeRowSchema, type PlanRecipeRow } from "../domain/meal-plan";

/**
 * "Ångra" after a dish was removed (AD-20): puts the row removePlanRecipe
 * returned back with the same id, servings and place. Revalidates Matsedel,
 * the list and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `mealplan_restore_failed`, also
 * when a row has the id, or the plan or the recipe is gone since; nothing is
 * changed then and the dish stays removed.
 */
export async function restorePlanRecipe(row: PlanRecipeRow): Promise<Result<PlanRecipeRow>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = planRecipeRowSchema.safeParse(row);
  if (!parsed.success) return fail("validation");

  try {
    const restored = await restorePlanRecipeIn(await createClient(), parsed.data);
    revalidateFor("meal_plan_recipe");
    return ok(restored);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_restore_failed", { reason: error.detail });
    return fail("mealplan_restore_failed");
  }
}

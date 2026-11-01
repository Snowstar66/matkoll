"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { setServingsIn } from "../data/write";
import { servingsChangeSchema, type ServingsChange } from "../domain/meal-plan";

/**
 * The portion selector on a dish (FR-13): saves the dish's servings, at least
 * 1. The selector shows the new value at once (useOptimistic); the shopping
 * list and the dish's status follow the saved value. Revalidates Matsedel,
 * the list and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `mealplan_servings_failed`, also
 * when the user has no dish with the id (removed, or another user's).
 */
export async function setServings(change: ServingsChange): Promise<Result<ServingsChange>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = servingsChangeSchema.safeParse(change);
  if (!parsed.success) return fail("validation");
  const { id, servings } = parsed.data;

  try {
    const found = await setServingsIn(await createClient(), id, servings);
    revalidateFor("meal_plan_recipe");
    if (!found) {
      console.error("mealplan_servings_failed", { reason: "not_found" });
      return fail("mealplan_servings_failed");
    }
    return ok({ id, servings });
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_servings_failed", { reason: error.detail });
    return fail("mealplan_servings_failed");
  }
}

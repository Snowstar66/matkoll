"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { deletePlanIn } from "../data/write";
import { planIdSchema } from "../domain/meal-plan";

/**
 * "Ta bort matsedel" on an earlier plan, after the question "Ta bort Vecka
 * 42? Det går inte att ångra." (FR-14, AD-20): deletes it for good, with its
 * dishes and what the shopping list keeps for it, under the meal plan lock.
 * A plan that is gone already (deleted elsewhere, or a retry after a lost
 * answer) counts as deleted. The current plan is never deleted. Revalidates
 * Matsedel, the list and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `mealplan_delete_failed`, also
 * for the current plan.
 */
export async function deletePlan(id: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = planIdSchema.safeParse(id);
  if (!parsed.success) return fail("validation");
  try {
    await deletePlanIn(await createClient(), parsed.data);
    revalidateFor("meal_plan");
    return ok({ id: parsed.data });
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_delete_failed", { reason: error.detail });
    return fail("mealplan_delete_failed");
  }
}

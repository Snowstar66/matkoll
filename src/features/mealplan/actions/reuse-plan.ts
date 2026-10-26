"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { setCurrentPlanIn } from "../data/write";
import { createFailure } from "./create-failure";
import { isoWeekName, planIdSchema } from "../domain/meal-plan";

/**
 * "Använd igen" on an earlier meal plan (FR-14, AD-22): makes a new current
 * plan, "Vecka <ISO week>", with the same dishes and servings in the same
 * order, in one transaction (set_current_meal_plan). Dishes whose recipe is
 * deleted are left out. The plan that was current becomes an earlier plan.
 * The client sends `newPlanId`, made once per tap, so a retry after a lost
 * answer makes the plan once. Revalidates Matsedel, the list and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `mealplan_plan_gone` (the plan is
 * deleted), `mealplan_plans_changed` (no dish has its recipe left, or the
 * new id is an earlier plan now: a new attempt needs a new id) or
 * `mealplan_create_failed` (may pass on a retry with the same id); nothing
 * is changed then.
 */
export async function reusePlan(id: string, newPlanId?: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const source = planIdSchema.safeParse(id);
  const target = planIdSchema.optional().safeParse(newPlanId);
  if (!source.success || !target.success) return fail("validation");
  try {
    const created = await setCurrentPlanIn(await createClient(), {
      id: target.data ?? crypto.randomUUID(),
      name: isoWeekName(new Date()),
      sourceId: source.data,
    });
    revalidateFor("meal_plan");
    return ok({ id: created.id });
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    return createFailure(error);
  }
}

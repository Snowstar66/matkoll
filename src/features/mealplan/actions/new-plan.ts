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
 * "Ny matsedel" in Tidigare (FR-14, AD-22): makes a new, empty current plan,
 * "Vecka <ISO week>", in one transaction (set_current_meal_plan); the plan
 * that was current becomes an earlier plan, or is deleted when it has no dishes. The client sends `newPlanId`,
 * made once per tap, so a retry after a lost answer makes the plan once.
 * Revalidates Matsedel, the list and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `mealplan_plans_changed` (the new
 * id is an earlier plan now: a new attempt needs a new id) or
 * `mealplan_create_failed` (may pass on a retry with the same id); nothing is
 * changed then.
 */
export async function newPlan(newPlanId?: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const target = planIdSchema.optional().safeParse(newPlanId);
  if (!target.success) return fail("validation");
  try {
    const created = await setCurrentPlanIn(await createClient(), {
      id: target.data ?? crypto.randomUUID(),
      name: isoWeekName(new Date()),
    });
    revalidateFor("meal_plan");
    return ok({ id: created.id });
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    return createFailure(error);
  }
}

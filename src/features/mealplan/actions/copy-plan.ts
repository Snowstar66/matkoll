"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { copyPlanIn } from "../data/write";
import { planIdSchema } from "../domain/meal-plan";
import { currentWeekStart, maxWeeksAhead, weeksBetween, weekStartSchema } from "../domain/week";

/**
 * "Kopiera till …" on an earlier week (Story 13.9): copies the plan's dishes
 * (recipe, title, servings and weekday) onto the plan of `targetWeek`, a
 * Monday from this week to 12 weeks ahead, after the dishes that week has, in
 * one transaction (copy_meal_plan). Dishes whose recipe is deleted are left
 * out. Returns how many were copied. Revalidates Matsedel, the list and the
 * recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `mealplan_plan_gone` (the plan is
 * deleted), `mealplan_copy_nothing` (no dish with a recipe, or the plan's own
 * week) or `mealplan_copy_failed`; nothing is copied then.
 */
export async function copyPlan(id: string, targetWeek: string): Promise<Result<{ copied: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const source = planIdSchema.safeParse(id);
  const week = weekStartSchema.safeParse(targetWeek);
  if (!source.success || !week.success) return fail("validation");
  const ahead = weeksBetween(currentWeekStart(), week.data);
  if (ahead < 0 || ahead > maxWeeksAhead) return fail("validation");
  try {
    const copied = await copyPlanIn(await createClient(), source.data, week.data);
    revalidateFor("meal_plan_recipe");
    return ok({ copied });
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_copy_failed", { reason: error.detail });
    if (error.code === "P0002") return fail("mealplan_plan_gone");
    if (error.code === "22023") return fail("mealplan_copy_nothing");
    return fail("mealplan_copy_failed");
  }
}

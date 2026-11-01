"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { setWeekdayIn } from "../data/write";
import { weekdayChangeSchema, type WeekdayChange } from "../domain/meal-plan";

/**
 * "Flytta till dag" on a dish (Story 13.5): saves the dish's weekday, 1
 * (måndag) to 7 (söndag), or `null` for "Ingen dag än". Several dishes may lie
 * on a day; the shopping list does not read the day. Revalidates Matsedel,
 * the list and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `mealplan_weekday_failed`, also
 * when the user has no dish with the id.
 */
export async function setWeekday(change: WeekdayChange): Promise<Result<WeekdayChange>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = weekdayChangeSchema.safeParse(change);
  if (!parsed.success) return fail("validation");
  const { id, weekday } = parsed.data;

  try {
    const found = await setWeekdayIn(await createClient(), id, weekday);
    revalidateFor("meal_plan_recipe");
    if (!found) {
      console.error("mealplan_weekday_failed", { reason: "not_found" });
      return fail("mealplan_weekday_failed");
    }
    return ok({ id, weekday });
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_weekday_failed", { reason: error.detail });
    return fail("mealplan_weekday_failed");
  }
}

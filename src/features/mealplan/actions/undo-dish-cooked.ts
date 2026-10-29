"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { undoDishCookedIn } from "../data/write";
import { undoCookedSchema, type UndoCookedInput } from "../domain/cooked";

/**
 * "Ångra" after markDishCooked (Story 13.4): puts back what was deducted and
 * takes the "lagad" mark off the dish, in one transaction (undo_dish_cooked).
 * Revalidates Matsedel, the list, Hemma and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `mealplan_cooked_undo_failed`
 * (also when a pantry row was made again under the same key); nothing is
 * changed then.
 */
export async function undoDishCooked(input: UndoCookedInput): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = undoCookedSchema.safeParse(input);
  if (!parsed.success) return fail("validation");

  try {
    await undoDishCookedIn(await createClient(), parsed.data.dishId, parsed.data.rows);
    revalidateFor("meal_plan_recipe");
    revalidateFor("pantry_item");
    return ok(null);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_cooked_undo_failed", { reason: error.detail });
    revalidateFor("meal_plan_recipe");
    return fail("mealplan_cooked_undo_failed");
  }
}

"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { cookedAlreadyCode, markDishCookedIn } from "../data/write";
import { markCookedSchema, type MarkCookedInput, type MarkedCooked } from "../domain/cooked";

/**
 * "Markera som lagad" in its sheet (Story 13.4, FR-13): takes each
 * deduction off the pantry of the place the sheet read (`siteId`, checked against the user's own places) and marks the dish cooked,
 * in one transaction (mark_dish_cooked), so both happen or neither. The
 * dish then leaves the shopping list. Returns the time and the rows touched,
 * which only count for the confirmation; the ledger for "Ångra" is kept in the database. Revalidates Matsedel, the list,
 * Hemma and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `mealplan_cooked_already` or
 * `mealplan_cooked_failed` (also for a dish that is gone or a place that is
 * gone); nothing is changed then.
 */
export async function markDishCooked(input: MarkCookedInput): Promise<Result<MarkedCooked>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = markCookedSchema.safeParse(input);
  if (!parsed.success) return fail("validation");

  try {
    const marked = await markDishCookedIn(await createClient(), parsed.data.dishId, parsed.data.siteId, parsed.data.deductions);
    revalidateFor("meal_plan_recipe");
    revalidateFor("pantry_item");
    return ok(marked);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_cooked_failed", { reason: error.detail });
    revalidateFor("meal_plan_recipe");
    return fail(error.detail === `cooked_failed ${cookedAlreadyCode}` ? "mealplan_cooked_already" : "mealplan_cooked_failed");
  }
}

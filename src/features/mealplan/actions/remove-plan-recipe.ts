"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { removePlanRecipeIn } from "../data/write";
import type { PlanRecipeRow } from "../domain/meal-plan";

const idSchema = z.uuid();

/**
 * "Ta bort" on a dish, by swipe or the card's button (FR-13, AD-20): removes
 * it for good, without asking first, and returns it as it was, so "Ångra"
 * can put it back with restorePlanRecipe. Revalidates Matsedel, the list and
 * the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `mealplan_remove_failed`, also
 * when the user has no dish with the id (another user's, or gone already);
 * the routes are revalidated then too, so a plan that still shows it catches up.
 */
export async function removePlanRecipe(id: string): Promise<Result<PlanRecipeRow>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");

  try {
    const removed = await removePlanRecipeIn(await createClient(), parsed.data);
    revalidateFor("meal_plan_recipe");
    if (!removed) {
      console.error("mealplan_remove_failed", { reason: "not_found" });
      return fail("mealplan_remove_failed");
    }
    return ok(removed);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_remove_failed", { reason: error.detail });
    return fail("mealplan_remove_failed");
  }
}

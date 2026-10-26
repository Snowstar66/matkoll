import "server-only";
import { fail, type Result } from "@/lib/errors";
import type { MealPlanDataError } from "../data/client";

/**
 * The result for "Använd igen" or "Ny matsedel" when set_current_meal_plan
 * fails: `mealplan_plan_gone` when the source plan is gone (P0002), and
 * `mealplan_plans_changed` when trying again with the same id cannot help
 * (55000: the id is an earlier plan now; 23505: it is taken; 22023: no dish
 * has its recipe left). Anything else may pass, so it is
 * `mealplan_create_failed` and the client keeps its id for a retry.
 */
export function createFailure(error: MealPlanDataError): Result<never> {
  console.error("mealplan_create_failed", { reason: error.detail });
  switch (error.code) {
    case "P0002":
      return fail("mealplan_plan_gone");
    case "55000":
    case "23505":
    case "22023":
      return fail("mealplan_plans_changed");
    default:
      return fail("mealplan_create_failed");
  }
}

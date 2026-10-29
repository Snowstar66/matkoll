"use server";

import { requireUser } from "@/features/auth/server";
import { getRecipesByIds, RecipeDataError } from "@/features/recipes/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { getCurrentPlanIn } from "../data/queries";
import { addToCurrentPlanIn } from "../data/write";
import {
  addToPlanSchema,
  clampServings,
  defaultWeekday,
  isoWeekName,
  todayWeekday,
  type AddToPlanInput,
  type PlanRecipeRow,
} from "../domain/meal-plan";

/**
 * "Lägg på matsedeln" and a tap in Lägg till rätt (FR-13, AD-22): adds the
 * recipe as a new dish last on the current meal plan, creating the plan
 * ("Vecka 44") when there is none. The same recipe may be on the plan more
 * than once. The servings are the recipe's own (within 1–1000) unless given.
 * The dish's title limit (200) is the recipe's own, so the title fits. The recipe is
 * read through recipes/server.ts (AD-1) for its title, which the dish keeps,
 * and its servings. `weekday` is the day (1–7), `null` for none, or left out
 * for the first day from today without a dish. The client sends `id`, made once per tap, so a retry
 * after a lost answer adds the dish once. Revalidates Matsedel, the list and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `mealplan_add_failed`, also
 * when the user has no recipe with the id.
 */
export async function addToCurrentPlan(input: AddToPlanInput): Promise<Result<PlanRecipeRow>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = addToPlanSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { recipeId, servings, id, weekday } = parsed.data;

  try {
    const [recipe] = await getRecipesByIds([recipeId]);
    if (!recipe) {
      console.error("mealplan_add_failed", { reason: "recipe_not_found" });
      return fail("mealplan_add_failed");
    }
    const db = await createClient();
    // No day given: the first free day from today (Story 13.5); `null` is "Ingen dag än" on purpose.
    const day =
      weekday === undefined ? defaultWeekday((await getCurrentPlanIn(db))?.recipes ?? [], todayWeekday(new Date())) : weekday;
    const added = await addToCurrentPlanIn(db, {
      id: id ?? crypto.randomUUID(),
      recipeId,
      recipeTitle: recipe.title,
      servings: servings ?? clampServings(recipe.originalServings),
      planName: isoWeekName(new Date()),
      weekday: day,
    });
    revalidateFor("meal_plan_recipe");
    return ok(added);
  } catch (error) {
    if (error instanceof RecipeDataError || error instanceof MealPlanDataError) {
      console.error("mealplan_add_failed", { reason: error.detail });
      return fail("mealplan_add_failed");
    }
    throw error;
  }
}

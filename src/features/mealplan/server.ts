import "server-only";
import { cache } from "react";
import { getIngredientNames } from "@/features/catalog/server";
import type { PantrySnapshot, SelectedSite } from "@/features/pantry";
import { getPantryForStatus } from "@/features/pantry/server";
import type { RecipeListRow } from "@/features/recipes";
import { getRecipesByIds, RecipeDataError } from "@/features/recipes/server";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPlanIn, getPlanIn, listPreviousPlansIn } from "./data/queries";
import { detachRecipeIn } from "./data/write";
import { currentWeekStart } from "./domain/week";
import {
  toPlanDishes,
  type DishRecipe,
  type MealPlan,
  type PlanDetail,
  type PlanDish,
  type PlanSummary,
} from "./domain/meal-plan";

// Server-only entry (AD-1). The functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. The read functions are
// for pages, after requireUserOrRedirect, inside <Suspense> (AD-18), and for
// other modules' server code; detachRecipe is for recipes.deleteRecipe only.
// Setting servings, removing a dish, "Ångra", "Använd igen", "Ny matsedel"
// and deleting a plan are the Server Actions in ./actions, used by this
// module's own ui.

/** What the functions below throw when Supabase fails; never user data. */
export { MealPlanDataError } from "./data/client";

/**
 * Server Action for "Lägg på matsedeln" (AD-22). A page passes it to a client
 * component of another module (the recipe view), which cannot import this
 * module's actions (AD-1).
 */
export { addToCurrentPlan } from "./actions/add-to-current-plan";

/**
 * The signed-in user's current meal plan with its dishes in order (`id`,
 * `recipeId`, `recipeTitle`, `servings`, `position`), or `null` when there is
 * none (AD-22). Memoised per request. Throws MealPlanDataError.
 */
export const getCurrentPlan = cache(async (): Promise<MealPlan | null> => {
  return getCurrentPlanIn(await createClient());
});

/**
 * The signed-in user's meal plan for the week starting `weekStart` (a Monday),
 * or `null` when that week has none yet (Story 13.7). Memoised per request.
 * Throws MealPlanDataError.
 */
export const getPlanForWeek = cache(async (weekStart: string): Promise<MealPlan | null> => {
  return getCurrentPlanIn(await createClient(), weekStart);
});

/**
 * The signed-in user's earlier meal plans, newest first, with their number of
 * dishes (FR-14); never the current one. Throws MealPlanDataError.
 */
export async function listPreviousPlans(): Promise<PlanSummary[]> {
  return listPreviousPlansIn(await createClient());
}

/**
 * One of the signed-in user's meal plans with its dishes in order, or `null`
 * when the user has none with the id. A dish whose recipe is deleted has
 * `recipeId: null` and keeps its title. Memoised per request. Throws MealPlanDataError.
 */
export const getPlan = cache(async (id: string): Promise<PlanDetail | null> => {
  return getPlanIn(await createClient(), id);
});

/** What Matsedel shows: the plan's name and dishes, and the pantry for their status. */
export type MealPlanView = {
  /** `null` when there is no current plan yet. */
  plan: { id: string; name: string } | null;
  dishes: PlanDish[];
  /** The catalog names of the dishes' ingredients by id, for "Markera som lagad" (Story 13.4). */
  names?: Record<string, string>;
  /** The whole pantry, or `null` when it cannot be read: the dishes are shown without status. */
  snapshot: PantrySnapshot | null;
  /**
   * The place the snapshot is of, for the line "Lager: Stugan" under the page
   * title (AD-24); `null` without a status, or when it cannot be read.
   */
  site: SelectedSite | null;
};

/**
 * The recipes behind the dishes, or none when they cannot be read (logged as
 * `mealplan_recipes_unavailable`): the dishes are then shown by their stored
 * titles, without image, time or status. Other errors are bugs and are thrown.
 */
async function recipesOrNone(ids: readonly string[]): Promise<RecipeListRow[]> {
  if (ids.length === 0) return [];
  try {
    return await getRecipesByIds(ids);
  } catch (error) {
    if (!(error instanceof RecipeDataError)) throw error;
    console.error("mealplan_recipes_unavailable", { reason: error.detail });
    return [];
  }
}

/**
 * Matsedel's data (FR-13): the plan of `weekStart` (default this week; a week
 * with no plan gives `plan: null` and no dishes, Story 13.7), each dish with its recipe's
 * image, time, own servings and lines (recipes.getRecipesByIds, AD-1), and
 * the pantry for the status (AD-7) with the place it is of (AD-24), read in
 * parallel; pantry.getPantryForStatus reads the place once and then that
 * place's pantry, so the line "Lager" names the place the status was counted
 * against. A dish whose recipe is gone, or could not be read, has `recipe:
 * null`; a place or pantry that cannot be read gives `snapshot: null` and
 * `site: null`. Throws MealPlanDataError.
 */
export async function getMealPlanView(weekStart?: string): Promise<MealPlanView> {
  const [plan, { snapshot, site }] = await Promise.all([
    weekStart && weekStart !== currentWeekStart() ? getPlanForWeek(weekStart) : getCurrentPlan(),
    getPantryForStatus(),
  ]);
  if (!plan) return { plan: null, dishes: [], names: {}, snapshot, site };
  const recipes = await recipesOrNone(plan.recipes.flatMap((dish) => (dish.recipeId ? [dish.recipeId] : [])));
  const byId = new Map<string, DishRecipe>(
    recipes.map((recipe) => [
      recipe.id,
      {
        imageUrl: recipe.imageUrl,
        totalMinutes: recipe.totalMinutes,
        originalServings: recipe.originalServings,
        lines: recipe.lines,
      },
    ]),
  );
  const ingredientIds = [
    ...new Set(recipes.flatMap((recipe) => recipe.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])))),
  ];
  const names = ingredientIds.length > 0 ? await getIngredientNames(ingredientIds).catch(() => ({})) : {};
  return { plan: { id: plan.id, name: plan.name }, dishes: toPlanDishes(plan.recipes, byId), names, snapshot, site };
}

/**
 * Removes every dish of the recipe from the signed-in user's current meal
 * plan (AD-20). recipes.deleteRecipe calls it, after requireUser, before the
 * recipe is deleted; earlier plans keep their dishes, without the recipe.
 * Revalidates Matsedel and the list when a dish was removed (AD-18). Throws
 * MealPlanDataError, and then the recipe must not be deleted.
 */
export async function detachRecipe(recipeId: string): Promise<void> {
  const removed = await detachRecipeIn(await createClient(), recipeId);
  if (removed > 0) revalidateFor("meal_plan_recipe");
}

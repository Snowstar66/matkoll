import "server-only";
import { z } from "zod";
import {
  comparePlanRecipes,
  type MealPlan,
  type PlanDetail,
  type PlanRecipe,
  type PlanRecipeRow,
  type PlanSummary,
} from "../domain/meal-plan";
import { currentWeekStart } from "../domain/week";
import { MealPlanDataError, type MealPlanDb } from "./client";

/** A meal_plan_recipe row's columns, as the queries read them. */
export const dishColumns = "id, meal_plan_id, recipe_id, recipe_title, servings, position, cooked_at, weekday";

export type DishRow = {
  id: string;
  meal_plan_id: string;
  recipe_id: string | null;
  recipe_title: string;
  servings: number;
  position: number;
  cooked_at: string | null;
  weekday: number | null;
};

export function toPlanRecipeRow(row: DishRow): PlanRecipeRow {
  return {
    id: row.id,
    mealPlanId: row.meal_plan_id,
    recipeId: row.recipe_id,
    recipeTitle: row.recipe_title,
    servings: row.servings,
    position: row.position,
    cookedAt: row.cooked_at,
    weekday: row.weekday,
  };
}

function toPlanRecipe(row: DishRow): PlanRecipe {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    recipeTitle: row.recipe_title,
    servings: row.servings,
    position: row.position,
    cookedAt: row.cooked_at,
    weekday: row.weekday,
  };
}

/**
 * The signed-in user's meal plan for the week starting `weekStart` (a Monday;
 * default this week, "the current plan") with its dishes in order, or `null`
 * when there is none (AD-22, Story 13.7). RLS limits the query to the user's
 * rows; the unique index keeps at most one plan per week. Throws
 * MealPlanDataError.
 */
export async function getCurrentPlanIn(db: MealPlanDb, weekStart: string = currentWeekStart()): Promise<MealPlan | null> {
  const { data, error } = await db
    .from("meal_plan")
    .select(`id, name, dishes:meal_plan_recipe(${dishColumns})`)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw new MealPlanDataError(`query_failed ${error.code}`);
  if (!data) return null;
  return { id: data.id, name: data.name, recipes: data.dishes.map(toPlanRecipe).sort(comparePlanRecipes) };
}

/**
 * The signed-in user's earlier meal plans (every plan that is not of this week or a coming one),
 * newest first (by creation time, then id), each with its number of dishes (FR-14). RLS limits the query
 * to the user's rows. Throws MealPlanDataError.
 */
export async function listPreviousPlansIn(db: MealPlanDb): Promise<PlanSummary[]> {
  const { data, error } = await db
    .from("meal_plan")
    .select("id, name, created_at, dishes:meal_plan_recipe(count)")
    .or(`week_start.is.null,week_start.lt.${currentWeekStart()}`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new MealPlanDataError(`query_failed ${error.code}`);
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    dishCount: row.dishes[0]?.count ?? 0,
  }));
}

/**
 * One of the signed-in user's meal plans with its dishes in order, or `null`
 * when the user has none with the id (also when the id is not a uuid). RLS
 * limits the query to the user's rows. Throws MealPlanDataError.
 */
export async function getPlanIn(db: MealPlanDb, id: string): Promise<PlanDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await db
    .from("meal_plan")
    .select(`id, name, is_current, week_start, created_at, dishes:meal_plan_recipe(${dishColumns})`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new MealPlanDataError(`query_failed ${error.code}`);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    isCurrent: data.week_start !== null && data.week_start >= currentWeekStart(),
    weekStart: data.week_start,
    createdAt: data.created_at,
    recipes: data.dishes.map(toPlanRecipe).sort(comparePlanRecipes),
  };
}

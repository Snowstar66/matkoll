import "server-only";
import { z } from "zod";
import { cookedUndoRowSchema, type MarkedCooked } from "../domain/cooked";
import { planRecipeRowSchema, type PlanRecipeRow } from "../domain/meal-plan";
import { currentWeekStart } from "../domain/week";
import { MealPlanDataError, type MealPlanDb } from "./client";
import { dishColumns, toPlanRecipeRow } from "./queries";

const idSchema = z.uuid();

/** What addToCurrentPlanIn adds: the dish's id, its recipe, the recipe's title and the servings. */
export type NewDish = {
  id: string;
  recipeId: string;
  recipeTitle: string;
  servings: number;
  /** The current plan's name if one has to be created: "Vecka 44". */
  planName: string;
  /** The day it lies on, 1–7; `null` or left out for none. */
  weekday?: number | null;
  /** The Monday of the week to add to (Story 13.7); left out, this week. */
  weekStart?: string;
};

/**
 * addToCurrentPlan (AD-22) for the signed-in user: adds the dish last on the
 * meal plan of `weekStart` (default this week), creating that week's plan when
 * there is none, in one transaction (add_to_plan, Story 13.7). A dish id the user already has returns that row,
 * so a retry adds the dish once. Throws MealPlanDataError: `add_failed
 * <code>` when Postgres refuses (23503: not the user's recipe).
 */
export async function addToCurrentPlanIn(db: MealPlanDb, dish: NewDish): Promise<PlanRecipeRow> {
  const { data, error } = await db.rpc("add_to_plan", {
    week_start: dish.weekStart ?? currentWeekStart(),
    dish_id: dish.id,
    dish_recipe_id: dish.recipeId,
    dish_recipe_title: dish.recipeTitle,
    dish_servings: dish.servings,
    plan_name: dish.planName,
    ...(dish.weekday ? { dish_weekday: dish.weekday } : {}),
  });
  if (error) throw new MealPlanDataError(`add_failed ${error.code}`);
  return toPlanRecipeRow(data);
}

/**
 * Sets a dish's servings. `false` when the user has no dish with the id
 * (another user's, or removed). Throws MealPlanDataError.
 */
export async function setServingsIn(db: MealPlanDb, userId: string, id: string, servings: number): Promise<boolean> {
  if (!idSchema.safeParse(id).success) throw new MealPlanDataError("invalid_id");
  const { data, error } = await db
    .from("meal_plan_recipe")
    .update({ servings })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new MealPlanDataError(`update_failed ${error.code}`);
  return data.length > 0;
}

/**
 * Moves a dish to a weekday (1–7), or to "Ingen dag än" with `null` (Story
 * 13.5). The dish keeps its place in the plan's order. `false` when the user
 * has no dish with the id. Throws MealPlanDataError.
 */
export async function setWeekdayIn(db: MealPlanDb, userId: string, id: string, weekday: number | null): Promise<boolean> {
  if (!idSchema.safeParse(id).success) throw new MealPlanDataError("invalid_id");
  const { data, error } = await db
    .from("meal_plan_recipe")
    .update({ weekday })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new MealPlanDataError(`weekday_failed ${error.code}`);
  return data.length > 0;
}

/**
 * Removes a dish for good (AD-20) and returns it as it was, for "Ångra";
 * `null` when the user has no dish with the id. The delete names the user as
 * well as relying on RLS. Throws MealPlanDataError.
 */
export async function removePlanRecipeIn(db: MealPlanDb, userId: string, id: string): Promise<PlanRecipeRow | null> {
  if (!idSchema.safeParse(id).success) throw new MealPlanDataError("invalid_id");
  const { data, error } = await db
    .from("meal_plan_recipe")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select(dishColumns);
  if (error) throw new MealPlanDataError(`remove_failed ${error.code}`);
  const [row] = data;
  return row ? toPlanRecipeRow(row) : null;
}

/**
 * "Ångra" (AD-20): puts a removed dish back with the same id, plan, recipe,
 * title, servings and place, under the meal plan lock (restore_plan_recipe).
 * Refused when the plan is no longer the current one (55000), a row has the
 * id (23505), or the recipe is gone (23503). Throws MealPlanDataError:
 * `invalid_row` before anything is written, or `restore_failed <code>`.
 */
export async function restorePlanRecipeIn(db: MealPlanDb, row: PlanRecipeRow): Promise<PlanRecipeRow> {
  const parsed = planRecipeRowSchema.safeParse(row);
  if (!parsed.success) throw new MealPlanDataError("invalid_row");
  const { id, mealPlanId, recipeId, recipeTitle, servings, position, weekday } = parsed.data;
  const { data, error } = await db.rpc("restore_plan_recipe", {
    dish: { id, meal_plan_id: mealPlanId, recipe_id: recipeId, recipe_title: recipeTitle, servings, position, weekday: weekday ?? null },
  });
  if (error) throw new MealPlanDataError(`restore_failed ${error.code}`);
  return toPlanRecipeRow(data);
}

/**
 * detachRecipe (AD-20): removes every dish of the recipe from the signed-in
 * user's current meal plan, in one statement under the meal plan lock
 * (detach_recipe_from_current_plan), before the recipe is deleted; earlier
 * plans keep theirs, which the foreign key leaves without a recipe. Returns
 * the number of dishes removed. Throws MealPlanDataError.
 */
export async function detachRecipeIn(db: MealPlanDb, recipeId: string): Promise<number> {
  if (!idSchema.safeParse(recipeId).success) throw new MealPlanDataError("invalid_id");
  const { data, error } = await db.rpc("detach_recipe_from_current_plan", { detached_recipe_id: recipeId });
  if (error) throw new MealPlanDataError(`detach_failed ${error.code}`);
  return data;
}

/** What setCurrentPlanIn makes: the new plan's id (made by the client), its name and, for "Använd igen", the plan to copy. */
export type NewPlan = {
  id: string;
  /** "Vecka 44". */
  name: string;
  /** The plan whose dishes the new plan gets; none for an empty plan. */
  sourceId?: string;
};

/**
 * "Använd igen" and "Ny matsedel" (AD-22): makes a new current meal plan in
 * one transaction under the meal plan lock (set_current_meal_plan). The plan
 * that was current becomes an earlier plan, or is deleted when it has no
 * dishes. With `sourceId` the new plan gets that plan's dishes and servings
 * in the same order, except those whose recipe is deleted. A plan id that is
 * the user's current plan already returns that plan, so a retry makes the
 * plan once. Throws MealPlanDataError: `invalid_id` before anything is
 * written, or `set_current_failed <code>` with `code`: P0002 no such source
 * plan; 22023 no dish in it has its recipe left; 55000 the id is an earlier
 * plan now; 23505 the id is taken; 23514 the name is refused.
 */
export async function setCurrentPlanIn(db: MealPlanDb, plan: NewPlan): Promise<{ id: string; name: string }> {
  if (!idSchema.safeParse(plan.id).success) throw new MealPlanDataError("invalid_id");
  if (plan.sourceId !== undefined && !idSchema.safeParse(plan.sourceId).success) {
    throw new MealPlanDataError("invalid_id");
  }
  const { data, error } = await db.rpc("set_current_meal_plan", {
    new_plan_id: plan.id,
    plan_name: plan.name,
    ...(plan.sourceId ? { source_id: plan.sourceId } : {}),
  });
  if (error) throw new MealPlanDataError(`set_current_failed ${error.code}`, error.code);
  return { id: data.id, name: data.name };
}

/**
 * Deletes an earlier meal plan for good, with its dishes and everything the
 * shopping list keeps for it (on delete cascade), under the meal plan lock
 * (delete_meal_plan), so it never races "Använd igen" of the same plan.
 * `false` when the user has no plan with the id: gone already, or another
 * user's. Throws MealPlanDataError: `invalid_id`, or `delete_failed <code>`
 * (55000: the current plan, which is never deleted).
 */
export async function deletePlanIn(db: MealPlanDb, id: string): Promise<boolean> {
  if (!idSchema.safeParse(id).success) throw new MealPlanDataError("invalid_id");
  const { data, error } = await db.rpc("delete_meal_plan", { plan_id: id });
  if (error) throw new MealPlanDataError(`delete_failed ${error.code}`, error.code);
  return data;
}

/** The Postgres code of mark_dish_cooked (Story 13.4) for a dish that is cooked already. */
export const cookedAlreadyCode = "MK417";

/**
 * "Markera som lagad" (Story 13.4): in one transaction (mark_dish_cooked),
 * takes each deduction off the user's pantry rows of that ingredient and unit
 * in the place `siteId` (oldest row first, a row that reaches 0 is deleted,
 * never below 0) and sets the dish's cooked_at. Returns the time and the
 * rows touched as they were, for undoDishCookedIn. Throws MealPlanDataError:
 * `cooked_failed <code>`, with MK417 for a dish that is cooked already,
 * MK410 for a place that is gone and P0002 for a dish that is gone.
 */
export async function markDishCookedIn(
  db: MealPlanDb,
  dishId: string,
  siteId: string | null,
  deductions: readonly { ingredientId: string; unit: string; amount: number }[],
): Promise<MarkedCooked> {
  const { data, error } = await db.rpc("mark_dish_cooked", {
    dish: dishId,
    // Only read when there are deductions; the nil uuid stands in when there are none and no place.
    site: siteId ?? "00000000-0000-0000-0000-000000000000",
    deductions: deductions.map((item) => ({ ingredient_id: item.ingredientId, unit: item.unit, amount: item.amount })),
  });
  if (error) throw new MealPlanDataError(`cooked_failed ${error.code}`);
  const parsed = z.object({ cooked_at: z.string(), rows: z.array(cookedUndoRowSchema) }).safeParse(data);
  if (!parsed.success) throw new MealPlanDataError("cooked_bad_answer");
  return { cookedAt: parsed.data.cooked_at, rows: parsed.data.rows };
}

/**
 * "Ångra" after "Markera som lagad" (undo_dish_cooked): puts the deducted
 * amounts back and clears cooked_at, in one transaction. Throws
 * MealPlanDataError `cooked_undo_failed <code>` (MK418: nothing to undo, as it
 * ran already or the dish was unmarked; 23505: a row was made again under the
 * same key; nothing is changed). The rows come from the dish's server-side ledger.
 */
export async function undoDishCookedIn(db: MealPlanDb, dishId: string): Promise<void> {
  const { error } = await db.rpc("undo_dish_cooked", { dish: dishId });
  if (error) throw new MealPlanDataError(`cooked_undo_failed ${error.code}`);
}

/**
 * Takes the "lagad" mark off a dish; the pantry is not touched. `false` when
 * the user has no dish with the id. Throws MealPlanDataError.
 */
export async function unmarkDishCookedIn(db: MealPlanDb, userId: string, id: string): Promise<boolean> {
  if (!idSchema.safeParse(id).success) throw new MealPlanDataError("invalid_id");
  const { data, error } = await db
    .from("meal_plan_recipe")
    .update({ cooked_at: null, cooked_deductions: null })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new MealPlanDataError(`uncook_failed ${error.code}`);
  return data.length > 0;
}

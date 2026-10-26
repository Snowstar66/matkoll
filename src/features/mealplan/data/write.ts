import "server-only";
import { z } from "zod";
import { planRecipeRowSchema, type PlanRecipeRow } from "../domain/meal-plan";
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
};

/**
 * addToCurrentPlan (AD-22) for the signed-in user: adds the dish last on the
 * current meal plan, creating the plan when there is none, in one transaction
 * (add_to_current_plan). A dish id the user already has returns that row,
 * so a retry adds the dish once. Throws MealPlanDataError: `add_failed
 * <code>` when Postgres refuses (23503: not the user's recipe).
 */
export async function addToCurrentPlanIn(db: MealPlanDb, dish: NewDish): Promise<PlanRecipeRow> {
  const { data, error } = await db.rpc("add_to_current_plan", {
    dish_id: dish.id,
    dish_recipe_id: dish.recipeId,
    dish_recipe_title: dish.recipeTitle,
    dish_servings: dish.servings,
    plan_name: dish.planName,
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
  const { id, mealPlanId, recipeId, recipeTitle, servings, position } = parsed.data;
  const { data, error } = await db.rpc("restore_plan_recipe", {
    dish: { id, meal_plan_id: mealPlanId, recipe_id: recipeId, recipe_title: recipeTitle, servings, position },
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

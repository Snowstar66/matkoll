import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCurrentPlanIn, getWeekCountsIn } from "@/features/mealplan/data/queries";
import { addToCurrentPlanIn, copyPlanIn } from "@/features/mealplan/data/write";
import { addWeeks, currentWeekStart } from "@/features/mealplan/domain/week";
import { localSupabaseUrl } from "../local-supabase";
import { anonClient, createTestUser, deleteTestUsers, type Db } from "./support";

// Story 13.9: copy_meal_plan copies an earlier week's dishes onto a week's plan.

async function addRecipe(db: Db, title: string): Promise<string> {
  const { data, error } = await db
    .from("recipe")
    .insert({ title, original_servings: 4, source_kind: "text" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** An earlier plan (last week's) with dishes: [recipe, servings, weekday]. */
async function earlierPlan(db: Db, dishes: [string, number, number | null][]): Promise<string> {
  const plan = await db
    .from("meal_plan")
    .insert({ name: "Vecka 43", week_start: addWeeks(currentWeekStart(), -1) })
    .select("id")
    .single();
  if (plan.error) throw plan.error;
  for (const [index, [recipeId, servings, weekday]] of dishes.entries()) {
    const { error } = await db.from("meal_plan_recipe").insert({
      meal_plan_id: plan.data.id,
      recipe_id: recipeId,
      recipe_title: `Rätt ${index}`,
      servings,
      position: index,
      weekday,
    });
    if (error) throw error;
  }
  return plan.data.id;
}

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("copy_meal_plan", () => {
  it("copies the dishes with servings and weekdays, in order, onto a week that has no plan", async () => {
    const user = await createTestUser("mealplan-copy");
    const a = await addRecipe(user.db, "Linssoppa");
    const b = await addRecipe(user.db, "Gryta");
    const source = await earlierPlan(user.db, [
      [a, 2, 3],
      [b, 6, null],
    ]);
    const target = addWeeks(currentWeekStart(), 1);
    expect(await copyPlanIn(user.db, source, target)).toBe(2);
    const plan = await getCurrentPlanIn(user.db, target);
    expect(plan?.name).toMatch(/^Vecka \d+$/);
    expect(plan?.recipes.map((dish) => [dish.recipeId, dish.recipeTitle, dish.servings, dish.weekday, dish.position])).toEqual([
      [a, "Rätt 0", 2, 3, 0],
      [b, "Rätt 1", 6, null, 1],
    ]);
    expect(await getWeekCountsIn(user.db, [currentWeekStart(), target])).toEqual({ [target]: 2 });
  });

  it("appends when the target week has dishes, and copies again as new dishes", async () => {
    const user = await createTestUser("mealplan-copy-append");
    const a = await addRecipe(user.db, "Linssoppa");
    const source = await earlierPlan(user.db, [[a, 3, 5]]);
    const target = currentWeekStart();
    await addToCurrentPlanIn(user.db, {
      id: randomUUID(),
      recipeId: a,
      recipeTitle: "Linssoppa",
      servings: 4,
      planName: "Vecka 44",
      weekday: 1,
      weekStart: target,
    });
    await copyPlanIn(user.db, source, target);
    await copyPlanIn(user.db, source, target);
    const plan = await getCurrentPlanIn(user.db, target);
    expect(plan?.recipes.map((dish) => [dish.servings, dish.weekday, dish.position])).toEqual([
      [4, 1, 0],
      [3, 5, 1],
      [3, 5, 2],
    ]);
  });

  it("skips dishes whose recipe is deleted, and refuses when none is left", async () => {
    const user = await createTestUser("mealplan-copy-gone");
    const a = await addRecipe(user.db, "Linssoppa");
    const gone = await addRecipe(user.db, "Borta");
    const source = await earlierPlan(user.db, [
      [a, 4, 2],
      [gone, 4, 3],
    ]);
    await user.db.from("recipe").delete().eq("id", gone);
    const target = addWeeks(currentWeekStart(), 2);
    expect(await copyPlanIn(user.db, source, target)).toBe(1);

    await user.db.from("recipe").delete().eq("id", a);
    await expect(copyPlanIn(user.db, source, addWeeks(target, 1))).rejects.toMatchObject({ code: "22023" });
    expect(await getCurrentPlanIn(user.db, addWeeks(target, 1)), "nothing is left behind").toBeNull();
  });

  it("copies only the caller's own plans, and refuses a bad week and anonymous callers", async () => {
    const owner = await createTestUser("mealplan-copy-owner");
    const other = await createTestUser("mealplan-copy-other");
    const a = await addRecipe(owner.db, "Linssoppa");
    const source = await earlierPlan(owner.db, [[a, 4, 1]]);
    const target = addWeeks(currentWeekStart(), 1);
    await expect(copyPlanIn(other.db, source, target)).rejects.toMatchObject({ code: "P0002" });
    expect(await getCurrentPlanIn(other.db, target)).toBeNull();
    expect(await getCurrentPlanIn(owner.db, target)).toBeNull();

    await expect(copyPlanIn(owner.db, source, addWeeks(currentWeekStart(), -1))).rejects.toMatchObject({ code: "22023" });
    await expect(copyPlanIn(owner.db, source, addWeeks(currentWeekStart(), 13))).rejects.toMatchObject({ code: "22023" });
    await expect(copyPlanIn(owner.db, source, "2026-11-04")).rejects.toMatchObject({ code: "22023" });

    const anon = await anonClient().rpc("copy_meal_plan", { source_plan: source, target_week: target });
    expect(anon.error).not.toBeNull();
  });
});

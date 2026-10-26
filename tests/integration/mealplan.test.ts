import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MealPlanDataError } from "@/features/mealplan/data/client";
import { getCurrentPlanIn } from "@/features/mealplan/data/queries";
import {
  addToCurrentPlanIn,
  detachRecipeIn,
  removePlanRecipeIn,
  restorePlanRecipeIn,
  setServingsIn,
  type NewDish,
} from "@/features/mealplan/data/write";
import { getRecipesByIdsIn } from "@/features/recipes/data/queries";
import { deleteRecipeIn } from "@/features/recipes/data/update";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, expectRlsIsolation, type Db } from "./support";

// The meal plan against local Supabase (AD-4, AD-20, AD-22): RLS on both
// tables, one current plan per user, add_to_current_plan creating the plan
// and adding dishes, the recipe's title kept when the recipe is deleted
// (on delete set null (recipe_id)), detachRecipe, and removing a dish with
// "Ångra" (same id).

async function addRecipe(db: Db, title = "Linssoppa", servings = 4): Promise<string> {
  const { data, error } = await db
    .from("recipe")
    .insert({ title, original_servings: servings, source_kind: "text" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function addPlan(db: Db, name = "Vecka 1", isCurrent = false): Promise<string> {
  const { data, error } = await db.from("meal_plan").insert({ name, is_current: isCurrent }).select("id").single();
  if (error) throw error;
  return data.id;
}

const dish = (recipeId: string, overrides: Partial<NewDish> = {}): NewDish => ({
  id: randomUUID(),
  recipeId,
  recipeTitle: "Linssoppa",
  servings: 4,
  planName: "Vecka 44",
  ...overrides,
});

async function dishRow(id: string) {
  const { data, error } = await adminClient().from("meal_plan_recipe").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("schema and RLS", () => {
  it("isolates meal_plan", async () => {
    await expectRlsIsolation("meal_plan", async () => ({ name: "Vecka 44" }));
  });

  it("isolates meal_plan_recipe", async () => {
    await expectRlsIsolation("meal_plan_recipe", async (owner) => ({
      meal_plan_id: await addPlan(owner),
      recipe_id: await addRecipe(owner),
      recipe_title: "Linssoppa",
      servings: 4,
      position: 0,
    }));
  });

  it("keeps at most one current meal plan per user", async () => {
    const user = await createTestUser("mealplan-current");
    await addPlan(user.db, "Vecka 43", true);
    const second = await user.db.from("meal_plan").insert({ name: "Vecka 44", is_current: true });
    expect(second.error?.code, "a second current plan").toBe("23505");
    // Earlier plans are not current, and there may be many.
    await addPlan(user.db, "Vecka 41");
    await addPlan(user.db, "Vecka 42");
    const other = await createTestUser("mealplan-current-other");
    await addPlan(other.db, "Vecka 44", true);
  });

  it("refuses an empty name or title, and fewer than 1 serving", async () => {
    const user = await createTestUser("mealplan-checks");
    const empty = await user.db.from("meal_plan").insert({ name: "  " });
    expect(empty.error?.code).toBe("23514");
    const planId = await addPlan(user.db);
    const recipeId = await addRecipe(user.db);
    for (const row of [
      { recipe_title: "", servings: 4 },
      { recipe_title: "x".repeat(201), servings: 4 },
      { recipe_title: "Linssoppa", servings: 0 },
      { recipe_title: "Linssoppa", servings: 1001 },
    ]) {
      const refused = await user.db
        .from("meal_plan_recipe")
        .insert({ meal_plan_id: planId, recipe_id: recipeId, position: 0, ...row });
      expect(refused.error?.code, JSON.stringify(row)).toBe("23514");
    }
  });

  it("refuses a dish on another user's plan or with another user's recipe", async () => {
    const owner = await createTestUser("mealplan-fk-owner");
    const other = await createTestUser("mealplan-fk-other");
    const ownPlan = await addPlan(other.db);
    const ownRecipe = await addRecipe(other.db);
    const theirPlan = await addPlan(owner.db);
    const theirRecipe = await addRecipe(owner.db);
    const base = { recipe_title: "Linssoppa", servings: 4, position: 0 };
    const onTheirPlan = await other.db
      .from("meal_plan_recipe")
      .insert({ ...base, meal_plan_id: theirPlan, recipe_id: ownRecipe });
    expect(onTheirPlan.error?.code).toBe("23503");
    const theirRecipeOnOwnPlan = await other.db
      .from("meal_plan_recipe")
      .insert({ ...base, meal_plan_id: ownPlan, recipe_id: theirRecipe });
    expect(theirRecipeOnOwnPlan.error?.code).toBe("23503");
  });

  it("deletes the dishes with their plan", async () => {
    const user = await createTestUser("mealplan-cascade");
    const recipeId = await addRecipe(user.db);
    const added = await addToCurrentPlanIn(user.db, dish(recipeId));
    const deleted = await user.db.from("meal_plan").delete().eq("id", added.mealPlanId);
    expect(deleted.error).toBeNull();
    expect(await dishRow(added.id)).toBeNull();
  });
});

describe("add_to_current_plan", () => {
  it("creates the current plan when there is none, named as given, and adds the dish last", async () => {
    const user = await createTestUser("mealplan-add");
    const soppa = await addRecipe(user.db, "Linssoppa");
    const gryta = await addRecipe(user.db, "Kycklinggryta", 2);
    expect(await getCurrentPlanIn(user.db)).toBeNull();

    const first = await addToCurrentPlanIn(user.db, dish(soppa));
    const second = await addToCurrentPlanIn(user.db, dish(gryta, { recipeTitle: "Kycklinggryta", servings: 2 }));
    // The same recipe again is a new row.
    const again = await addToCurrentPlanIn(user.db, dish(soppa, { servings: 6 }));

    const plan = await getCurrentPlanIn(user.db);
    expect(plan?.name).toBe("Vecka 44");
    expect(plan?.id).toBe(first.mealPlanId);
    expect([second.mealPlanId, again.mealPlanId]).toEqual([plan?.id, plan?.id]);
    expect(plan?.recipes).toEqual([
      { id: first.id, recipeId: soppa, recipeTitle: "Linssoppa", servings: 4, position: 0 },
      { id: second.id, recipeId: gryta, recipeTitle: "Kycklinggryta", servings: 2, position: 1 },
      { id: again.id, recipeId: soppa, recipeTitle: "Linssoppa", servings: 6, position: 2 },
    ]);
    const plans = await adminClient().from("meal_plan").select("id").eq("user_id", user.id);
    expect(plans.data).toHaveLength(1);
  });

  it("adds to the current plan, never to an earlier one", async () => {
    const user = await createTestUser("mealplan-add-current");
    const earlier = await addPlan(user.db, "Vecka 40");
    const current = await addPlan(user.db, "Vecka 43", true);
    const added = await addToCurrentPlanIn(user.db, dish(await addRecipe(user.db)));
    expect(added.mealPlanId).toBe(current);
    expect(added.mealPlanId).not.toBe(earlier);
    expect((await getCurrentPlanIn(user.db))?.name).toBe("Vecka 43");
  });

  it("creates one plan when two first adds run at once, with the dishes one after the other", async () => {
    const user = await createTestUser("mealplan-add-concurrent");
    const recipeId = await addRecipe(user.db);
    const [a, b] = await Promise.all([addToCurrentPlanIn(user.db, dish(recipeId)), addToCurrentPlanIn(user.db, dish(recipeId))]);
    expect(a.mealPlanId).toBe(b.mealPlanId);
    expect([a.position, b.position].sort()).toEqual([0, 1]);
    const plans = await adminClient().from("meal_plan").select("id").eq("user_id", user.id);
    expect(plans.data).toHaveLength(1);
  });

  it("adds a dish id once: a retry returns the same row", async () => {
    const user = await createTestUser("mealplan-add-retry");
    const recipeId = await addRecipe(user.db);
    const payload = dish(recipeId);
    const first = await addToCurrentPlanIn(user.db, payload);
    const retry = await addToCurrentPlanIn(user.db, payload);
    expect(retry).toEqual(first);
    expect((await getCurrentPlanIn(user.db))?.recipes).toHaveLength(1);
  });

  it("refuses another user's recipe, and anonymous callers", async () => {
    const owner = await createTestUser("mealplan-add-owner");
    const other = await createTestUser("mealplan-add-other");
    const theirs = await addRecipe(owner.db);
    await expect(addToCurrentPlanIn(other.db, dish(theirs))).rejects.toThrow(MealPlanDataError);
    expect(await getCurrentPlanIn(other.db), "nothing is left behind").toBeNull();

    const anon = await anonClient().rpc("add_to_current_plan", {
      dish_id: randomUUID(),
      dish_recipe_id: theirs,
      dish_recipe_title: "Linssoppa",
      dish_servings: 4,
      plan_name: "Vecka 44",
    });
    expect(anon.error?.code).toBe("42501");
  });
});

describe("servings, removal and Ångra", () => {
  it("sets the servings of the user's own dish only", async () => {
    const owner = await createTestUser("mealplan-servings");
    const other = await createTestUser("mealplan-servings-other");
    const added = await addToCurrentPlanIn(owner.db, dish(await addRecipe(owner.db)));
    expect(await setServingsIn(owner.db, owner.id, added.id, 6)).toBe(true);
    expect(await setServingsIn(other.db, other.id, added.id, 1)).toBe(false);
    expect((await dishRow(added.id))?.servings).toBe(6);
    await expect(setServingsIn(owner.db, owner.id, added.id, 0)).rejects.toThrow(MealPlanDataError);
  });

  it("removes a dish and puts it back with the same id, servings and place", async () => {
    const user = await createTestUser("mealplan-remove");
    const recipeId = await addRecipe(user.db);
    const first = await addToCurrentPlanIn(user.db, dish(recipeId));
    const second = await addToCurrentPlanIn(user.db, dish(recipeId, { servings: 3 }));

    const removed = await removePlanRecipeIn(user.db, user.id, second.id);
    expect(removed).toEqual(second);
    expect(await removePlanRecipeIn(user.db, user.id, second.id), "gone already").toBeNull();
    expect(await restorePlanRecipeIn(user.db, second)).toEqual(second);
    expect((await getCurrentPlanIn(user.db))?.recipes.map(({ id }) => id)).toEqual([first.id, second.id]);
    // The id is taken now.
    await expect(restorePlanRecipeIn(user.db, second)).rejects.toThrow(MealPlanDataError);
  });

  it("puts a dish back only onto the current plan", async () => {
    const user = await createTestUser("mealplan-restore-current");
    const recipeId = await addRecipe(user.db);
    const added = await addToCurrentPlanIn(user.db, dish(recipeId));
    const removed = await removePlanRecipeIn(user.db, user.id, added.id);
    if (!removed) throw new Error("not removed");
    // The plan is no longer current (as after "Använd igen" in Story 3.2).
    const { error } = await user.db.from("meal_plan").update({ is_current: false }).eq("id", added.mealPlanId);
    if (error) throw error;
    await expect(restorePlanRecipeIn(user.db, removed)).rejects.toThrow("restore_failed 55000");
    expect(await dishRow(added.id)).toBeNull();
  });

  it("refuses to put back another user's dish onto their plan", async () => {
    const owner = await createTestUser("mealplan-restore-owner");
    const other = await createTestUser("mealplan-restore-other");
    const added = await addToCurrentPlanIn(owner.db, dish(await addRecipe(owner.db)));
    const removed = await removePlanRecipeIn(owner.db, owner.id, added.id);
    if (!removed) throw new Error("not removed");
    await expect(restorePlanRecipeIn(other.db, removed)).rejects.toThrow(MealPlanDataError);
    expect(await dishRow(added.id)).toBeNull();
  });

  it("never removes another user's dish", async () => {
    const owner = await createTestUser("mealplan-remove-owner");
    const other = await createTestUser("mealplan-remove-other");
    const added = await addToCurrentPlanIn(owner.db, dish(await addRecipe(owner.db)));
    expect(await removePlanRecipeIn(other.db, other.id, added.id)).toBeNull();
    expect(await dishRow(added.id)).not.toBeNull();
  });
});

describe("deleting a recipe", () => {
  it("keeps the dish with its title and without the recipe (set null), the user unchanged", async () => {
    const user = await createTestUser("mealplan-set-null");
    const recipeId = await addRecipe(user.db, "Borttagen soppa");
    const added = await addToCurrentPlanIn(user.db, dish(recipeId, { recipeTitle: "Borttagen soppa" }));
    expect(await deleteRecipeIn(user.db, user.id, recipeId)).toBe(true);
    expect(await dishRow(added.id)).toMatchObject({
      user_id: user.id,
      recipe_id: null,
      recipe_title: "Borttagen soppa",
    });
  });

  it("detachRecipe takes the recipe off the current plan only, before the delete", async () => {
    const user = await createTestUser("mealplan-detach");
    const soppa = await addRecipe(user.db, "Linssoppa");
    const gryta = await addRecipe(user.db, "Kycklinggryta");
    const earlierPlan = await addPlan(user.db, "Vecka 40");
    const earlier = await user.db
      .from("meal_plan_recipe")
      .insert({ meal_plan_id: earlierPlan, recipe_id: soppa, recipe_title: "Linssoppa", servings: 4, position: 0 })
      .select("id")
      .single();
    if (earlier.error) throw earlier.error;
    await addToCurrentPlanIn(user.db, dish(soppa));
    await addToCurrentPlanIn(user.db, dish(soppa));
    const kept = await addToCurrentPlanIn(user.db, dish(gryta, { recipeTitle: "Kycklinggryta" }));

    expect(await detachRecipeIn(user.db, soppa)).toBe(2);
    expect((await getCurrentPlanIn(user.db))?.recipes.map(({ id }) => id)).toEqual([kept.id]);
    await deleteRecipeIn(user.db, user.id, soppa);
    // The earlier plan keeps the dish, as "Borttaget recept".
    expect(await dishRow(earlier.data.id)).toMatchObject({ recipe_id: null, recipe_title: "Linssoppa" });
  });

  it("detachRecipe without a current plan changes nothing", async () => {
    const user = await createTestUser("mealplan-detach-none");
    expect(await detachRecipeIn(user.db, await addRecipe(user.db))).toBe(0);
  });
});

describe("getRecipesByIds", () => {
  it("reads the user's recipes among the ids, with their lines, and leaves the rest out", async () => {
    const owner = await createTestUser("mealplan-recipes");
    const other = await createTestUser("mealplan-recipes-other");
    const soppa = await addRecipe(owner.db, "Linssoppa", 4);
    const line = await owner.db
      .from("recipe_ingredient")
      .insert({ recipe_id: soppa, position: 0, original_text: "salt", is_vague: true })
      .select("id")
      .single();
    if (line.error) throw line.error;
    const theirs = await addRecipe(other.db, "Annans soppa");

    const rows = await getRecipesByIdsIn(owner.db, [soppa, soppa, theirs, randomUUID()]);
    expect(rows).toEqual([
      {
        id: soppa,
        title: "Linssoppa",
        imageUrl: null,
        totalMinutes: null,
        originalServings: 4,
        isFavorite: false,
        lines: [{ id: line.data.id, ingredientId: null, amount: null, unit: null, isVague: true }],
      },
    ]);
    expect(await getRecipesByIdsIn(owner.db, [])).toEqual([]);
  });
});

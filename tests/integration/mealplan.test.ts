import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MealPlanDataError } from "@/features/mealplan/data/client";
import { getCurrentPlanIn, getPlanIn, listPreviousPlansIn } from "@/features/mealplan/data/queries";
import {
  addToCurrentPlanIn,
  deletePlanIn,
  detachRecipeIn,
  removePlanRecipeIn,
  restorePlanRecipeIn,
  setCurrentPlanIn,
  setServingsIn,
  setWeekdayIn,
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
// "Ångra" (same id). Story 3.2: set_current_meal_plan ("Använd igen" and "Ny
// matsedel"), the earlier plans and deleting one.

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
      { id: first.id, recipeId: soppa, recipeTitle: "Linssoppa", servings: 4, position: 0, cookedAt: null, weekday: null },
      { id: second.id, recipeId: gryta, recipeTitle: "Kycklinggryta", servings: 2, position: 1, cookedAt: null, weekday: null },
      { id: again.id, recipeId: soppa, recipeTitle: "Linssoppa", servings: 6, position: 2, cookedAt: null, weekday: null },
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
        createdAt: expect.any(String),
        lines: [{ id: line.data.id, ingredientId: null, amount: null, unit: null, isVague: true, originalText: "salt" }],
      },
    ]);
    expect(await getRecipesByIdsIn(owner.db, [])).toEqual([]);
  });
});

async function plansOf(userId: string) {
  const { data, error } = await adminClient()
    .from("meal_plan")
    .select("id, name, is_current")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  return data;
}

/** A plan made at a given time, so the order of the earlier plans is known. */
async function setCreatedAt(planId: string, createdAt: string) {
  const { error } = await adminClient().from("meal_plan").update({ created_at: createdAt }).eq("id", planId);
  if (error) throw error;
}

describe("set_current_meal_plan", () => {
  it("Använd igen: a new current plan with the same dishes and servings in order, without deleted recipes", async () => {
    const user = await createTestUser("mealplan-reuse");
    const soppa = await addRecipe(user.db, "Linssoppa");
    const gryta = await addRecipe(user.db, "Kycklinggryta");
    const borta = await addRecipe(user.db, "Borttagen paj");
    const first = await addToCurrentPlanIn(user.db, dish(soppa, { servings: 2 }));
    await addToCurrentPlanIn(user.db, dish(borta, { recipeTitle: "Borttagen paj" }));
    await addToCurrentPlanIn(user.db, dish(gryta, { recipeTitle: "Kycklinggryta", servings: 6 }));
    await addToCurrentPlanIn(user.db, dish(soppa, { servings: 3 }));
    const source = first.mealPlanId;
    // The source becomes an earlier plan with a new current one, then its recipe is deleted.
    await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    expect(await deleteRecipeIn(user.db, user.id, borta)).toBe(true);

    const reused = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 46", sourceId: source });
    const current = await getCurrentPlanIn(user.db);
    expect(current?.id).toBe(reused.id);
    expect(current?.name).toBe("Vecka 46");
    expect(current?.recipes.map(({ recipeId, recipeTitle, servings, position }) => ({ recipeId, recipeTitle, servings, position }))).toEqual([
      { recipeId: soppa, recipeTitle: "Linssoppa", servings: 2, position: 0 },
      { recipeId: gryta, recipeTitle: "Kycklinggryta", servings: 6, position: 1 },
      { recipeId: soppa, recipeTitle: "Linssoppa", servings: 3, position: 2 },
    ]);
    // New dishes; the source keeps its own, the deleted recipe's as "Borttaget recept".
    const sourcePlan = await getPlanIn(user.db, source);
    expect(sourcePlan?.recipes).toHaveLength(4);
    expect(sourcePlan?.recipes[1]).toMatchObject({ recipeId: null, recipeTitle: "Borttagen paj" });
    const sourceIds = new Set(sourcePlan?.recipes.map(({ id }) => id));
    expect(current?.recipes.some(({ id }) => sourceIds.has(id))).toBe(false);
    // Exactly one current plan; the source is an earlier plan, and the empty
    // Vecka 45 was deleted instead of kept.
    expect((await plansOf(user.id)).map(({ name, is_current }) => [name, is_current])).toEqual([
      ["Vecka 44", false],
      ["Vecka 46", true],
    ]);
  });

  it("Ny matsedel: an empty current plan, and the one that was current becomes an earlier plan", async () => {
    const user = await createTestUser("mealplan-new");
    const added = await addToCurrentPlanIn(user.db, dish(await addRecipe(user.db)));
    const created = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    expect(await getCurrentPlanIn(user.db)).toEqual({ id: created.id, name: "Vecka 45", recipes: [] });
    expect(await getPlanIn(user.db, added.mealPlanId)).toMatchObject({ isCurrent: false, recipes: [{ id: added.id }] });
    // A new dish goes onto the new plan.
    const next = await addToCurrentPlanIn(user.db, dish(await addRecipe(user.db)));
    expect(next.mealPlanId).toBe(created.id);
  });

  it("makes the first plan when there is none", async () => {
    const user = await createTestUser("mealplan-new-first");
    const created = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 44" });
    expect((await getCurrentPlanIn(user.db))?.id).toBe(created.id);
  });

  it("makes a plan id once: a retry returns the same plan and switches nothing", async () => {
    const user = await createTestUser("mealplan-new-retry");
    const plan = { id: randomUUID(), name: "Vecka 44" };
    const first = await setCurrentPlanIn(user.db, plan);
    expect(await setCurrentPlanIn(user.db, plan)).toEqual(first);
    expect(await plansOf(user.id)).toHaveLength(1);
  });

  it("is all or nothing: a refused name or an unknown source leaves the current plan as it was", async () => {
    const owner = await createTestUser("mealplan-reuse-refused");
    const other = await createTestUser("mealplan-reuse-refused-other");
    const added = await addToCurrentPlanIn(owner.db, dish(await addRecipe(owner.db)));
    await expect(setCurrentPlanIn(owner.db, { id: randomUUID(), name: "  " })).rejects.toThrow("set_current_failed 23514");
    await expect(
      setCurrentPlanIn(owner.db, { id: randomUUID(), name: "Vecka 45", sourceId: randomUUID() }),
    ).rejects.toThrow("set_current_failed P0002");
    // Another user's plan is no source.
    const theirs = await addToCurrentPlanIn(other.db, dish(await addRecipe(other.db)));
    await expect(
      setCurrentPlanIn(owner.db, { id: randomUUID(), name: "Vecka 45", sourceId: theirs.mealPlanId }),
    ).rejects.toThrow("set_current_failed P0002");
    expect(await plansOf(owner.id)).toEqual([{ id: added.mealPlanId, name: "Vecka 44", is_current: true }]);
    expect(await plansOf(other.id)).toEqual([{ id: theirs.mealPlanId, name: "Vecka 44", is_current: true }]);
  });

  it("keeps one current plan when two switches run at once", async () => {
    const user = await createTestUser("mealplan-new-concurrent");
    const added = await addToCurrentPlanIn(user.db, dish(await addRecipe(user.db)));
    await Promise.all([
      setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" }),
      setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45", sourceId: added.mealPlanId }),
    ]);
    // Whichever ran first, there is one current plan and the first plan is an earlier one.
    const plans = await plansOf(user.id);
    expect(plans.filter(({ is_current }) => is_current)).toHaveLength(1);
    expect(plans.find(({ id }) => id === added.mealPlanId)?.is_current).toBe(false);
  });

  it("puts a removed dish back only onto the current plan, not after Använd igen", async () => {
    const user = await createTestUser("mealplan-reuse-restore");
    const recipeId = await addRecipe(user.db);
    await addToCurrentPlanIn(user.db, dish(recipeId));
    const added = await addToCurrentPlanIn(user.db, dish(recipeId));
    const removed = await removePlanRecipeIn(user.db, user.id, added.id);
    if (!removed) throw new Error("not removed");
    await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45", sourceId: added.mealPlanId });
    await expect(restorePlanRecipeIn(user.db, removed)).rejects.toThrow("restore_failed 55000");
  });

  it("refuses a retry with an id that is an earlier plan now", async () => {
    const user = await createTestUser("mealplan-retry-earlier");
    const plan = { id: randomUUID(), name: "Vecka 44" };
    await setCurrentPlanIn(user.db, plan);
    await addToCurrentPlanIn(user.db, dish(await addRecipe(user.db)));
    const next = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    await expect(setCurrentPlanIn(user.db, plan)).rejects.toThrow("set_current_failed 55000");
    expect((await getCurrentPlanIn(user.db))?.id).toBe(next.id);
  });

  it("refuses to use again a plan where every dish's recipe is deleted, and changes nothing", async () => {
    const user = await createTestUser("mealplan-reuse-nothing");
    const recipeId = await addRecipe(user.db, "Borttagen soppa");
    const gone = await addToCurrentPlanIn(user.db, dish(recipeId, { recipeTitle: "Borttagen soppa" }));
    const current = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    await addToCurrentPlanIn(user.db, dish(await addRecipe(user.db)));
    await deleteRecipeIn(user.db, user.id, recipeId);
    await expect(
      setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 46", sourceId: gone.mealPlanId }),
    ).rejects.toThrow("set_current_failed 22023");
    expect((await getCurrentPlanIn(user.db))?.id).toBe(current.id);
    expect(await plansOf(user.id)).toHaveLength(2);
  });

  it("deletes an empty current plan instead of keeping it as an earlier plan", async () => {
    const user = await createTestUser("mealplan-empty-current");
    const added = await addToCurrentPlanIn(user.db, dish(await addRecipe(user.db)));
    const empty = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    const again = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    const reused = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 46", sourceId: added.mealPlanId });
    const plans = await plansOf(user.id);
    expect(plans.map(({ id, is_current }) => [id, is_current])).toEqual([
      [added.mealPlanId, false],
      [reused.id, true],
    ]);
    expect([empty.id, again.id].some((id) => plans.some((plan) => plan.id === id))).toBe(false);
    expect(await listPreviousPlansIn(user.db)).toHaveLength(1);
  });

  it("never races a delete of the same plan: Använd igen either copies it or finds it gone", async () => {
    for (let round = 0; round < 5; round += 1) {
      const user = await createTestUser(`mealplan-delete-reuse-${round}`);
      const recipeId = await addRecipe(user.db);
      const source = await addToCurrentPlanIn(user.db, dish(recipeId));
      await addToCurrentPlanIn(user.db, dish(recipeId));
      const current = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
      await addToCurrentPlanIn(user.db, dish(recipeId));
      const [deleted, reused] = await Promise.allSettled([
        deletePlanIn(user.db, source.mealPlanId),
        setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 46", sourceId: source.mealPlanId }),
      ]);
      expect(deleted).toEqual({ status: "fulfilled", value: true });
      expect(await getPlanIn(user.db, source.mealPlanId)).toBeNull();
      const now = await getCurrentPlanIn(user.db);
      if (reused.status === "fulfilled") {
        expect(now?.id).toBe(reused.value.id);
        expect(now?.recipes).toHaveLength(2);
      } else {
        expect(String(reused.reason)).toContain("set_current_failed P0002");
        expect(now?.id).toBe(current.id);
      }
    }
  });

  it("refuses anonymous callers, and another user's plan id", async () => {
    const owner = await createTestUser("mealplan-new-owner");
    const other = await createTestUser("mealplan-new-other");
    const taken = await setCurrentPlanIn(owner.db, { id: randomUUID(), name: "Vecka 44" });
    await expect(setCurrentPlanIn(other.db, { id: taken.id, name: "Vecka 44" })).rejects.toThrow(
      "set_current_failed 23505",
    );
    expect(await getCurrentPlanIn(other.db)).toBeNull();
    const anon = await anonClient().rpc("set_current_meal_plan", { new_plan_id: randomUUID(), plan_name: "Vecka 44" });
    expect(anon.error?.code).toBe("42501");
  });
});

describe("earlier plans", () => {
  it("lists the earlier plans newest first with their number of dishes, never the current one or another user's", async () => {
    const user = await createTestUser("mealplan-previous");
    const other = await createTestUser("mealplan-previous-other");
    const recipeId = await addRecipe(user.db);
    const oldest = await addToCurrentPlanIn(user.db, dish(recipeId));
    await addToCurrentPlanIn(user.db, dish(recipeId));
    const middle = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 44" });
    await addToCurrentPlanIn(user.db, dish(recipeId));
    const current = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45", sourceId: oldest.mealPlanId });
    await setCreatedAt(oldest.mealPlanId, "2025-10-27T10:00:00Z");
    await setCreatedAt(middle.id, "2026-10-26T10:00:00Z");
    await setPlanWith(other);

    const previous = await listPreviousPlansIn(user.db);
    expect(previous).toEqual([
      { id: middle.id, name: "Vecka 44", createdAt: expect.stringMatching(/^2026-10-26T10:00:00/), dishCount: 1 },
      { id: oldest.mealPlanId, name: "Vecka 44", createdAt: expect.stringMatching(/^2025-10-27T10:00:00/), dishCount: 2 },
    ]);
    expect(previous.some(({ id }) => id === current.id)).toBe(false);
    expect(await listPreviousPlansIn(other.db)).toHaveLength(1);
  });

  it("reads one of the user's plans, and nothing for another user's or an id that is not one", async () => {
    const owner = await createTestUser("mealplan-get");
    const other = await createTestUser("mealplan-get-other");
    const added = await addToCurrentPlanIn(owner.db, dish(await addRecipe(owner.db), { servings: 5 }));
    expect(await getPlanIn(owner.db, added.mealPlanId)).toEqual({
      id: added.mealPlanId,
      name: "Vecka 44",
      isCurrent: true,
      createdAt: expect.any(String),
      recipes: [{ id: added.id, recipeId: added.recipeId, recipeTitle: "Linssoppa", servings: 5, position: 0, cookedAt: null, weekday: null }],
    });
    expect(await getPlanIn(other.db, added.mealPlanId)).toBeNull();
    expect(await getPlanIn(owner.db, "inte-ett-id")).toBeNull();
  });

  it("deletes an earlier plan with its dishes, never the current one or another user's", async () => {
    const owner = await createTestUser("mealplan-delete");
    const other = await createTestUser("mealplan-delete-other");
    const added = await addToCurrentPlanIn(owner.db, dish(await addRecipe(owner.db)));
    await expect(deletePlanIn(owner.db, added.mealPlanId), "the current plan").rejects.toThrow("delete_failed 55000");
    const current = await setCurrentPlanIn(owner.db, { id: randomUUID(), name: "Vecka 45", sourceId: added.mealPlanId });
    expect(await deletePlanIn(other.db, added.mealPlanId), "another user's").toBe(false);
    expect(await deletePlanIn(owner.db, added.mealPlanId)).toBe(true);
    expect(await dishRow(added.id)).toBeNull();
    expect(await deletePlanIn(owner.db, added.mealPlanId), "gone already").toBe(false);
    const anon = await anonClient().rpc("delete_meal_plan", { plan_id: added.mealPlanId });
    expect(anon.error?.code).toBe("42501");
    // The new current plan and its copied dishes are untouched.
    expect((await getCurrentPlanIn(owner.db))?.recipes).toHaveLength(1);
    expect((await getCurrentPlanIn(owner.db))?.id).toBe(current.id);
  });
});

/** Gives `user` one earlier plan and a current one. */
async function setPlanWith(user: { db: Db }) {
  await addToCurrentPlanIn(user.db, dish(await addRecipe(user.db)));
  await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
}

describe("weekday (Story 13.5)", () => {
  it("adds a dish on a day, or on none, and moves it, within 1 to 7", async () => {
    const user = await createTestUser("mealplan-weekday");
    const recipe = await addRecipe(user.db);
    const onDay = await addToCurrentPlanIn(user.db, dish(recipe, { weekday: 3 }));
    const none = await addToCurrentPlanIn(user.db, dish(recipe));
    expect([onDay.weekday, none.weekday]).toEqual([3, null]);

    expect(await setWeekdayIn(user.db, user.id, none.id, 7)).toBe(true);
    expect((await dishRow(none.id))?.weekday).toBe(7);
    expect(await setWeekdayIn(user.db, user.id, none.id, null)).toBe(true);
    expect((await dishRow(none.id))?.weekday).toBeNull();
    // The check constraint refuses a day outside 1 to 7, and the order is untouched by a move.
    await expect(setWeekdayIn(user.db, user.id, none.id, 8)).rejects.toBeInstanceOf(MealPlanDataError);
    await expect(setWeekdayIn(user.db, user.id, none.id, 0)).rejects.toBeInstanceOf(MealPlanDataError);
    expect((await dishRow(none.id))?.position).toBe(1);
  });

  it("does not move another user's dish", async () => {
    const owner = await createTestUser("mealplan-weekday-owner");
    const other = await createTestUser("mealplan-weekday-other");
    const added = await addToCurrentPlanIn(owner.db, dish(await addRecipe(owner.db)));
    expect(await setWeekdayIn(other.db, other.id, added.id, 2)).toBe(false);
    expect(await setWeekdayIn(other.db, owner.id, added.id, 2)).toBe(false);
    expect((await dishRow(added.id))?.weekday).toBeNull();
  });

  it("puts the day back with Ångra after a removal", async () => {
    const user = await createTestUser("mealplan-weekday-undo");
    const added = await addToCurrentPlanIn(user.db, dish(await addRecipe(user.db), { weekday: 5 }));
    const removed = await removePlanRecipeIn(user.db, user.id, added.id);
    expect(removed?.weekday).toBe(5);
    const restored = await restorePlanRecipeIn(user.db, removed!);
    expect(restored.weekday).toBe(5);
    expect((await dishRow(added.id))?.weekday).toBe(5);
  });

  it("reads the day with the plan, and an old row without one has none", async () => {
    const user = await createTestUser("mealplan-weekday-read");
    const recipe = await addRecipe(user.db);
    const planId = await addPlan(user.db, "Vecka 44", true);
    const { error } = await user.db
      .from("meal_plan_recipe")
      .insert({ meal_plan_id: planId, recipe_id: recipe, recipe_title: "Gammal", servings: 2, position: 0 });
    if (error) throw error;
    await addToCurrentPlanIn(user.db, dish(recipe, { weekday: 2 }));
    expect((await getCurrentPlanIn(user.db))?.recipes.map((d) => d.weekday)).toEqual([null, 2]);
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MealPlanDataError } from "@/features/mealplan/data/client";
import { getCurrentPlanIn } from "@/features/mealplan/data/queries";
import { addToCurrentPlanIn, markDishCookedIn, undoDishCookedIn, unmarkDishCookedIn } from "@/features/mealplan/data/write";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type TestUser } from "./support";

// Markera som lagad (Story 13.4) against local Supabase: mark_dish_cooked
// deducts from the user's own pantry rows of the place and sets cooked_at in
// one transaction (all or nothing), never below 0 and never in another
// unit; undo_dish_cooked puts both back; unmarking leaves the pantry alone.

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

type Scenario = { user: TestUser; site: string; dishId: string; cream: string; flour: string };

async function scenario(name: string): Promise<Scenario> {
  const user = await createTestUser(name);
  const defaults = await user.db.rpc("ensure_pantry_defaults");
  if (defaults.error) throw defaults.error;
  const sites = await adminClient().from("pantry_site").select("id").eq("user_id", user.id);
  if (sites.error) throw sites.error;
  const site = sites.data[0]!.id;
  const ingredients = await user.db
    .from("ingredient")
    .insert([
      { name: "Grädde", normalized_name: "gradde", section: "Mejeri", location: "Kyl" },
      { name: "Mjöl", normalized_name: "mjol", section: "Skafferi", location: "Skafferi" },
    ])
    .select("id, name");
  if (ingredients.error) throw ingredients.error;
  const cream = ingredients.data.find((row) => row.name === "Grädde")!.id;
  const flour = ingredients.data.find((row) => row.name === "Mjöl")!.id;
  const recipe = await user.db
    .from("recipe")
    .insert({ title: "Pannkakor", original_servings: 4, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const dishId = randomUUID();
  await addToCurrentPlanIn(user.db, { id: dishId, recipeId: recipe.data.id, recipeTitle: "Pannkakor", servings: 4, planName: "Vecka 44" });
  const seeded = await adminClient()
    .from("pantry_item")
    .insert([
      { user_id: user.id, site_id: site, ingredient_id: cream, location: "Kyl", amount: 5, unit: "dl" },
      { user_id: user.id, site_id: site, ingredient_id: flour, location: "Skafferi", amount: 1, unit: "kg" },
    ]);
  if (seeded.error) throw seeded.error;
  return { user, site, dishId, cream, flour };
}

async function amount(user: TestUser, ingredientId: string): Promise<number | null> {
  const { data, error } = await user.db.from("pantry_item").select("amount").eq("ingredient_id", ingredientId);
  if (error) throw error;
  return data.length === 0 ? null : data.reduce((sum, row) => sum + Number(row.amount), 0);
}

async function cookedAt(user: TestUser, dishId: string): Promise<string | null> {
  const plan = await getCurrentPlanIn(user.db);
  return plan!.recipes.find((dish) => dish.id === dishId)!.cookedAt ?? null;
}

describe("mark_dish_cooked and undo_dish_cooked", () => {
  it("deducts and marks in one go, and undo restores both", async () => {
    const { user, site, dishId, cream, flour } = await scenario("cooked-basic");
    const marked = await markDishCookedIn(user.db, dishId, site, [
      { ingredientId: cream, unit: "dl", amount: 2 },
      { ingredientId: flour, unit: "kg", amount: 1 },
    ]);
    expect(await amount(user, cream)).toBe(3);
    // Flour reaches 0: the row is gone, as a pantry amount is above 0.
    expect(await amount(user, flour)).toBeNull();
    expect(await cookedAt(user, dishId)).toBe(marked.cookedAt);
    expect(marked.rows).toHaveLength(2);

    await undoDishCookedIn(user.db, dishId, marked.rows);
    expect(await amount(user, cream)).toBe(5);
    expect(await amount(user, flour)).toBe(1);
    expect(await cookedAt(user, dishId)).toBeNull();
  });

  it("never goes below 0 and never touches another unit", async () => {
    const { user, site, dishId, cream } = await scenario("cooked-clamp");
    await markDishCookedIn(user.db, dishId, site, [
      { ingredientId: cream, unit: "dl", amount: 50 },
      { ingredientId: cream, unit: "msk", amount: 3 },
    ]);
    expect(await amount(user, cream)).toBeNull();
  });

  it("is all or nothing: a failing deduction leaves the pantry and the dish alone", async () => {
    const { user, site, dishId, cream } = await scenario("cooked-atomic");
    await expect(
      markDishCookedIn(user.db, dishId, site, [
        { ingredientId: cream, unit: "dl", amount: 2 },
        { ingredientId: cream, unit: "dl", amount: -1 },
      ]),
    ).rejects.toBeInstanceOf(MealPlanDataError);
    expect(await amount(user, cream)).toBe(5);
    expect(await cookedAt(user, dishId)).toBeNull();
  });

  it("refuses a dish that is cooked already and deducts nothing twice", async () => {
    const { user, site, dishId, cream } = await scenario("cooked-twice");
    await markDishCookedIn(user.db, dishId, site, [{ ingredientId: cream, unit: "dl", amount: 1 }]);
    await expect(markDishCookedIn(user.db, dishId, site, [{ ingredientId: cream, unit: "dl", amount: 1 }])).rejects.toMatchObject({
      detail: "cooked_failed MK417",
    });
    expect(await amount(user, cream)).toBe(4);
  });

  it("works on own rows only: another user's dish, place and pantry are untouched", async () => {
    const mine = await scenario("cooked-mine");
    const theirs = await scenario("cooked-theirs");
    // Another user's dish is "no such dish" (P0002) and nothing changes.
    await expect(markDishCookedIn(mine.user.db, theirs.dishId, mine.site, [{ ingredientId: mine.cream, unit: "dl", amount: 1 }])).rejects.toMatchObject({
      detail: "cooked_failed P0002",
    });
    expect(await amount(mine.user, mine.cream)).toBe(5);
    // Another user's place is MK410.
    await expect(markDishCookedIn(mine.user.db, mine.dishId, theirs.site, [{ ingredientId: mine.cream, unit: "dl", amount: 1 }])).rejects.toMatchObject({
      detail: "cooked_failed MK410",
    });
    expect(await cookedAt(mine.user, mine.dishId)).toBeNull();
    // Another user's ingredient id deducts nothing from them.
    await markDishCookedIn(mine.user.db, mine.dishId, mine.site, [{ ingredientId: theirs.cream, unit: "dl", amount: 3 }]);
    expect(await amount(theirs.user, theirs.cream)).toBe(5);
    // Undo with the other user's dish or rows changes nothing of theirs.
    await expect(undoDishCookedIn(mine.user.db, theirs.dishId, [])).rejects.toBeInstanceOf(MealPlanDataError);
    expect(await cookedAt(theirs.user, theirs.dishId)).toBeNull();
  });

  it("refuses the anonymous caller", async () => {
    const { anonClient } = await import("./support");
    const { error } = await anonClient().rpc("mark_dish_cooked", { dish: randomUUID(), site: randomUUID(), deductions: [] });
    expect(error).not.toBeNull();
  });

  it("deducts oldest row first across locations, and undo puts each back", async () => {
    const { user, site, dishId, cream } = await scenario("cooked-rows");
    const second = await adminClient()
      .from("pantry_item")
      .insert({ user_id: user.id, site_id: site, ingredient_id: cream, location: "Frys", amount: 4, unit: "dl" });
    if (second.error) throw second.error;
    const marked = await markDishCookedIn(user.db, dishId, site, [{ ingredientId: cream, unit: "dl", amount: 7 }]);
    expect(await amount(user, cream)).toBe(2);
    expect(marked.rows.map((row) => row.deducted).sort()).toEqual([2, 5]);
    await undoDishCookedIn(user.db, dishId, marked.rows);
    expect(await amount(user, cream)).toBe(9);
  });

  it("unmarking takes the mark off and leaves the pantry as it is", async () => {
    const { user, site, dishId, cream } = await scenario("cooked-unmark");
    await markDishCookedIn(user.db, dishId, site, [{ ingredientId: cream, unit: "dl", amount: 2 }]);
    expect(await unmarkDishCookedIn(user.db, user.id, dishId)).toBe(true);
    expect(await cookedAt(user, dishId)).toBeNull();
    expect(await amount(user, cream)).toBe(3);
    expect(await unmarkDishCookedIn(user.db, user.id, randomUUID())).toBe(false);
  });

  it("marks a dish without any deduction", async () => {
    const { user, dishId, cream } = await scenario("cooked-empty");
    await markDishCookedIn(user.db, dishId, null, []);
    expect(await cookedAt(user, dishId)).not.toBeNull();
    expect(await amount(user, cream)).toBe(5);
  });
});

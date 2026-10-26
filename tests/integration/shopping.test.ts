import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { UNITS, type Section, type Unit } from "@/features/catalog";
import { loadIngredientDefaults, loadIngredientNames } from "@/features/catalog/data/queries";
import { getCurrentPlanIn } from "@/features/mealplan/data/queries";
import { addToCurrentPlanIn, deletePlanIn, setCurrentPlanIn, setServingsIn } from "@/features/mealplan/data/write";
import { loadPantrySnapshot } from "@/features/pantry/data/queries";
import { getRecipesByIdsIn } from "@/features/recipes/data/queries";
import { recipeLineKey } from "@/features/shopping";
import { listChecksIn, setCheckIn } from "@/features/shopping/data/checks";
import { ShoppingDataError } from "@/features/shopping/data/client";
import { addCustomItemIn, listCustomItemsIn, removeCustomItemIn } from "@/features/shopping/data/custom-items";
import { loadShoppingList, type ShoppingSources } from "@/features/shopping/data/queries";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, countRows, createTestUser, deleteTestUsers, expectRlsIsolation, type Db, type TestUser } from "./support";

// The shopping list against local Supabase (FR-15, AD-8): counted from a real
// meal plan, recipes, pantry and catalog through the modules' read functions,
// with the user's session client, as getShoppingList does it. The list is
// never stored; only the checks (Story 3.4, shopping_check) and Pontus's own
// items (Story 3.5, shopping_custom_item) are. NFR7: 10 dishes against 200
// pantry items within a second.

/** The modules' read functions with the test user's client, as the server entries give them. */
const sources = (db: Db): ShoppingSources => ({
  currentPlan: () => getCurrentPlanIn(db),
  recipesByIds: (ids) => getRecipesByIdsIn(db, ids),
  pantry: () => loadPantrySnapshot(db),
  ingredientNames: (ids) => loadIngredientNames(db, ids),
  ingredientDefaults: (ids) => loadIngredientDefaults(db, ids),
  checks: (planId) => listChecksIn(db, planId),
  customItems: (planId) => listCustomItemsIn(db, planId),
});

async function addIngredients(db: Db, items: { name: string; section: Section }[]): Promise<string[]> {
  const { data, error } = await db
    .from("ingredient")
    .insert(items.map(({ name, section }) => ({ name, normalized_name: name.toLowerCase(), section, location: "Skafferi" })))
    .select("id, name");
  if (error) throw error;
  const byName = new Map(data.map((row) => [row.name, row.id]));
  return items.map(({ name }) => byName.get(name)!);
}

type Line = { text: string; ingredientId: string | null; amount: number | null; unit: Unit | null; vague?: boolean };

async function addRecipe(db: Db, title: string, servings: number, lines: Line[]): Promise<string> {
  const recipe = await db
    .from("recipe")
    .insert({ title, original_servings: servings, source_kind: "text" })
    .select("id")
    .single();
  if (recipe.error) throw recipe.error;
  const inserted = await db.from("recipe_ingredient").insert(
    lines.map((line, position) => ({
      recipe_id: recipe.data.id,
      position,
      original_text: line.text,
      ingredient_id: line.ingredientId,
      amount: line.amount,
      unit: line.unit,
      is_vague: line.vague ?? false,
    })),
  );
  if (inserted.error) throw inserted.error;
  return recipe.data.id;
}

async function addDish(db: Db, recipeId: string, title: string, servings: number): Promise<string> {
  const dish = await addToCurrentPlanIn(db, { id: randomUUID(), recipeId, recipeTitle: title, servings, planName: "Vecka 44" });
  return dish.id;
}

async function setPantry(
  db: Db,
  rows: { ingredientId: string; amount: number | null; unit: Unit | null; location?: "Kyl" | "Frys" | "Skafferi" }[],
) {
  const { error } = await db.from("pantry_item").insert(
    rows.map(({ ingredientId, amount, unit, location = "Kyl" }) => ({ ingredient_id: ingredientId, location, amount, unit })),
  );
  if (error) throw error;
}

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("loadShoppingList", () => {
  let user: TestUser;
  const ids: Record<"gradde" | "mjol" | "salt" | "lok", string> = { gradde: "", mjol: "", salt: "", lok: "" };
  let gryta = "";
  let paj = "";

  beforeAll(async () => {
    user = await createTestUser("shopping");
    [ids.gradde, ids.mjol, ids.salt, ids.lok] = await addIngredients(user.db, [
      { name: "Grädde", section: "Mejeri" },
      { name: "Mjöl", section: "Skafferi" },
      { name: "Salt", section: "Skafferi" },
      { name: "Purjolök", section: "Frukt och grönt" },
    ]);
    const grytaId = await addRecipe(user.db, "Krämig kycklinggryta", 4, [
      { text: "2 dl grädde", ingredientId: ids.gradde, amount: 2, unit: "dl" },
      { text: "1 purjolök", ingredientId: ids.lok, amount: 1, unit: null },
      { text: "salt efter smak", ingredientId: ids.salt, amount: null, unit: null, vague: true },
      { text: "En näve persilja", ingredientId: null, amount: null, unit: null, vague: true },
    ]);
    const pajId = await addRecipe(user.db, "Paj", 4, [
      { text: "1 dl grädde", ingredientId: ids.gradde, amount: 1, unit: "dl" },
      { text: "2 dl mjöl", ingredientId: ids.mjol, amount: 2, unit: "dl" },
      { text: "en näve  persilja", ingredientId: null, amount: null, unit: null, vague: true },
    ]);
    gryta = await addDish(user.db, grytaId, "Krämig kycklinggryta", 6);
    paj = await addDish(user.db, pajId, "Paj", 4);
    await setPantry(user.db, [
      { ingredientId: ids.gradde, amount: 2, unit: "dl" },
      { ingredientId: ids.mjol, amount: 1, unit: "kg" },
      { ingredientId: ids.lok, amount: 1, unit: "st" },
    ]);
  });

  it("gives no plan and no lines before anything is on the plan", async () => {
    const empty = await createTestUser("shopping-empty");
    expect(await loadShoppingList(sources(empty.db))).toEqual({
      plan: null,
      lines: [],
      pantryUnavailable: false,
      checksUnavailable: false,
    });
  });

  it("scales, merges, takes the pantry off and groups by section", async () => {
    const list = await loadShoppingList(sources(user.db));
    expect(list.plan).toEqual({
      id: expect.any(String),
      name: "Vecka 44",
      dishCount: 2,
      skippedCount: 0,
      dishTitles: { [gryta]: "Krämig kycklinggryta", [paj]: "Paj" },
    });
    expect(list.pantryUnavailable).toBe(false);
    expect(
      list.lines.map((line) => [
        line.section,
        line.key,
        line.label,
        line.amount,
        line.unit,
        line.pantryNote ?? line.multiplier ?? null,
        line.origins,
      ]),
    ).toEqual([
      // 1 purjolök for 4 is 1.5 st for 6; 1 st at home, so 0.5 st short: 1 st to buy.
      ["Frukt och grönt", `r:${ids.lok}:st`, "Purjolök", 1, "st", null, [gryta]],
      // 3 dl for 6 portions and 1 dl, less 2 dl at home.
      ["Mejeri", `r:${ids.gradde}:dl`, "Grädde", 2, "dl", null, [gryta, paj]],
      ["Skafferi", `r:${ids.mjol}:dl`, "Mjöl", 2, "dl", "hemma: 1 kg", [paj]],
      ["Skafferi", `r:${ids.salt}:-`, "Salt", null, null, null, [gryta]],
      // Not scaled, but ×2,5: 6 of 4 portions and 4 of 4.
      ["Övrigt", "t:en näve persilja", "En näve persilja", null, null, 2.5, [gryta, paj]],
    ]);
  });

  it("is counted again from what is stored now: servings and pantry", async () => {
    await setServingsIn(user.db, user.id, gryta, 4);
    await setPantry(user.db, [
      { ingredientId: ids.salt, amount: null, unit: null },
      { ingredientId: ids.gradde, amount: 1, unit: "dl", location: "Frys" },
    ]);
    const list = await loadShoppingList(sources(user.db));
    expect(list.lines.map((line) => [line.label, line.amount, line.unit])).toEqual([
      // 1 st needed, 1 st at home: no Purjolök. 2 + 1 dl grädde needed, 3 dl
      // at home over Kyl and Frys. Salt is at home now.
      ["Mjöl", 2, "dl"],
      ["En näve persilja", null, null],
    ]);
  });

  it("reads the recipes' lines in their order, and leaves out a dish whose recipe is deleted", async () => {
    const owner = await createTestUser("shopping-order");
    const [lok] = await addIngredients(owner.db, [{ name: "Lök", section: "Frukt och grönt" }]);
    const recipe = await owner.db
      .from("recipe")
      .insert({ title: "Soppa", original_servings: 4, source_kind: "text" })
      .select("id")
      .single();
    if (recipe.error) throw recipe.error;
    // Saved last first, so the database's own order is not the recipe's.
    for (const [position, text] of [
      [2, "3 lökar"],
      [1, "2 lökar"],
      [0, "1 Gul lök"],
    ] as const) {
      const { error } = await owner.db
        .from("recipe_ingredient")
        .insert({ recipe_id: recipe.data.id, position, original_text: text, ingredient_id: lok, amount: 1, unit: "st", is_vague: false });
      if (error) throw error;
    }
    const [read] = await getRecipesByIdsIn(owner.db, [recipe.data.id]);
    expect(read.lines.map((line) => line.originalText)).toEqual(["1 Gul lök", "2 lökar", "3 lökar"]);

    const gone = await addRecipe(owner.db, "Borttagen", 4, [{ text: "1 dl mjölk", ingredientId: lok, amount: 1, unit: "dl" }]);
    await addDish(owner.db, recipe.data.id, "Soppa", 4);
    await addDish(owner.db, gone, "Borttagen", 4);
    const { error } = await owner.db.from("recipe").delete().eq("id", gone);
    if (error) throw error;
    const list = await loadShoppingList(sources(owner.db));
    expect(list.plan).toMatchObject({ dishCount: 1, skippedCount: 1 });
    expect(list.lines.map((line) => [line.label, line.amount, line.unit])).toEqual([["Lök", 3, "st"]]);
  });

  it("counts against an empty pantry when the pantry cannot be read", async () => {
    const list = await loadShoppingList({ ...sources(user.db), pantry: async () => null });
    expect(list.pantryUnavailable).toBe(true);
    expect(list.lines.find((line) => line.ingredientId === ids.gradde)?.amount).toBe(3);
  });

  it("counts 10 dishes against 200 pantry items well within a second (NFR7)", async () => {
    const many = await createTestUser("shopping-200");
    const ingredientIds = await addIngredients(
      many.db,
      Array.from({ length: 200 }, (_, index) => ({ name: `Vara ${index}`, section: index % 2 ? "Skafferi" : "Mejeri" })),
    );
    await setPantry(
      many.db,
      ingredientIds.map((ingredientId, index) => ({ ingredientId, amount: index % 3 === 0 ? null : 1, unit: index % 3 === 0 ? null : "dl" })),
    );
    for (let dish = 0; dish < 10; dish += 1) {
      const lines = Array.from({ length: 12 }, (_, position): Line => {
        const ingredientId = ingredientIds[(dish * 12 + position) % ingredientIds.length];
        if (position === 11) return { text: `rad ${dish} utan vara`, ingredientId: null, amount: 1, unit: "st" };
        if (position === 10) return { text: "salt efter smak", ingredientId, amount: null, unit: null, vague: true };
        return { text: `${position} dl vara`, ingredientId, amount: 2, unit: position % 2 ? "dl" : "g" };
      });
      const recipeId = await addRecipe(many.db, `Recept ${dish}`, 4, lines);
      await addDish(many.db, recipeId, `Recept ${dish}`, 6);
    }

    const started = performance.now();
    const list = await loadShoppingList(sources(many.db));
    const elapsed = performance.now() - started;
    console.info(`loadShoppingList, 10 dishes and 200 pantry items: ${elapsed.toFixed(0)} ms`);

    expect(list.plan?.dishCount).toBe(10);
    expect(list.lines.length).toBeGreaterThan(50);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("shopping_check", () => {
  /** A current plan with one dish (2 dl grädde for 4) and the key of its line. */
  async function planWithLine(user: TestUser): Promise<{ planId: string; key: string; dishId: string }> {
    const [gradde] = await addIngredients(user.db, [{ name: "Grädde", section: "Mejeri" }]);
    const recipeId = await addRecipe(user.db, "Gryta", 4, [{ text: "2 dl grädde", ingredientId: gradde, amount: 2, unit: "dl" }]);
    const dishId = await addDish(user.db, recipeId, "Gryta", 4);
    const plan = await getCurrentPlanIn(user.db);
    return { planId: plan!.id, key: `r:${gradde}:dl`, dishId };
  }

  async function addPlan(db: Db, isCurrent = true): Promise<string> {
    const { data, error } = await db.from("meal_plan").insert({ name: "Vecka 44", is_current: isCurrent }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  /** One user and plan for the refused keys. */
  let keyUser: TestUser | undefined;
  let keyPlanId: string | undefined;

  it("isolates shopping_check", async () => {
    await expectRlsIsolation("shopping_check", async (owner) => ({
      meal_plan_id: await addPlan(owner),
      line_key: "r:11111111-1111-4111-8111-111111111111:dl",
    }));
  });

  it("marks a checked line, keeps it through a recount with the same key, and takes the check off", async () => {
    const user = await createTestUser("shopping-check");
    const { planId, key, dishId } = await planWithLine(user);
    expect(await setCheckIn(user.db, planId, key, true)).toBe("saved");
    expect((await loadShoppingList(sources(user.db))).lines.map((line) => [line.key, line.amount, line.checked])).toEqual([
      [key, 2, true],
    ]);
    // Grädde 2 dl becomes 3 dl: the same key, still checked.
    await setServingsIn(user.db, user.id, dishId, 6);
    expect((await loadShoppingList(sources(user.db))).lines.map((line) => [line.key, line.amount, line.checked])).toEqual([
      [key, 3, true],
    ]);
    expect(await setCheckIn(user.db, planId, key, false)).toBe("saved");
    expect((await loadShoppingList(sources(user.db))).lines.map((line) => line.checked)).toEqual([false]);
    // Taking off a check that is not there changes nothing.
    expect(await setCheckIn(user.db, planId, key, false)).toBe("saved");
    expect(await countRows("shopping_check", user.id)).toBe(0);
  });

  it("keeps a check whose line is covered by the pantry, and applies it when the line comes back", async () => {
    const user = await createTestUser("shopping-check-covered");
    const { planId, key } = await planWithLine(user);
    await setCheckIn(user.db, planId, key, true);
    const [gradde] = key.slice(2).split(":");
    await setPantry(user.db, [{ ingredientId: gradde, amount: 2, unit: "dl" }]);
    expect((await loadShoppingList(sources(user.db))).lines).toEqual([]);
    expect(await listChecksIn(user.db, planId)).toEqual([key]);
    const { error } = await user.db.from("pantry_item").delete().eq("ingredient_id", gradde);
    if (error) throw error;
    expect((await loadShoppingList(sources(user.db))).lines.map((line) => line.checked)).toEqual([true]);
  });

  it("is one row per plan and key: checking twice changes nothing, a plain second insert is refused", async () => {
    const user = await createTestUser("shopping-check-unique");
    const { planId, key } = await planWithLine(user);
    await Promise.all([setCheckIn(user.db, planId, key, true), setCheckIn(user.db, planId, key, true)]);
    await setCheckIn(user.db, planId, key, true);
    expect(await countRows("shopping_check", user.id)).toBe(1);
    const again = await user.db.from("shopping_check").insert({ meal_plan_id: planId, line_key: key });
    expect(again.error?.code).toBe("23505");
  });

  it.each([
    ["an unknown kind", "x:abc"],
    ["an ingredient that is not an id", "r:paprika:st"],
    ["an unknown unit", "r:11111111-1111-4111-8111-111111111111:liter"],
    ["an own item that is not an id", "c:paprika"],
    ["a text with spaces around it", "t: salt "],
    ["a text that is too long", `t:${"a".repeat(301)}`],
    ["an upper-case ingredient id", "r:AAAAAAAA-1111-4111-8111-111111111111:dl"],
    ["an upper-case own item id", "c:AAAAAAAA-2222-4222-8222-222222222222"],
    ["a text with doubled spaces", "t:en  näve"],
    ["a text with a tab", "t:en\tnäve"],
  ])("refuses a key with %s", async (_, lineKey) => {
    keyUser ??= await createTestUser("shopping-check-key");
    keyPlanId ??= await addPlan(keyUser.db);
    const [user, planId] = [keyUser, keyPlanId];
    const { error } = await user.db.from("shopping_check").insert({ meal_plan_id: planId, line_key: lineKey });
    expect(error?.code).toBe("23514");
  });

  it("takes every key line-key.ts builds", async () => {
    const user = await createTestUser("shopping-check-keys");
    const planId = await addPlan(user.db);
    const keys = [
      ...UNITS.map((unit) => recipeLineKey("11111111-1111-4111-8111-111111111111", unit)),
      recipeLineKey("11111111-1111-4111-8111-111111111111", null),
      "c:22222222-2222-4222-8222-222222222222",
      "t:en näve persilja",
      `t:${"å".repeat(300)}`,
    ];
    const { error } = await user.db.from("shopping_check").insert(keys.map((lineKey) => ({ meal_plan_id: planId, line_key: lineKey })));
    expect(error).toBeNull();
    expect((await listChecksIn(user.db, planId)).sort()).toEqual([...keys].sort());
  });

  it("refuses a check on another user's plan (the composite foreign key)", async () => {
    const owner = await createTestUser("shopping-check-fk-owner");
    const other = await createTestUser("shopping-check-fk-other");
    const planId = await addPlan(owner.db);
    const { error } = await other.db
      .from("shopping_check")
      .insert({ meal_plan_id: planId, line_key: "r:11111111-1111-4111-8111-111111111111:dl" });
    expect(error?.code).toBe("23503");
    // Through set_shopping_check: not the caller's current plan, so nothing is written.
    expect(await setCheckIn(other.db, planId, "r:11111111-1111-4111-8111-111111111111:dl", true)).toBe("plan_changed");
    expect(await countRows("shopping_check", owner.id)).toBe(0);
  });

  it("leaves the checks with their plan when another plan becomes current, and deletes them with the plan", async () => {
    const user = await createTestUser("shopping-check-plans");
    const { planId, key } = await planWithLine(user);
    await setCheckIn(user.db, planId, key, true);

    // "Använd igen": the new plan's list has the same line, unchecked; A keeps its check.
    const reused = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45", sourceId: planId });
    const list = await loadShoppingList(sources(user.db));
    expect(list.plan?.id).toBe(reused.id);
    expect(list.lines.map((line) => [line.key, line.checked])).toEqual([[key, false]]);
    expect(await listChecksIn(user.db, planId)).toEqual([key]);

    // Deleting the earlier plan (Story 3.2) deletes its checks.
    expect(await deletePlanIn(user.db, planId)).toBe(true);
    const { count, error } = await adminClient()
      .from("shopping_check")
      .select("*", { count: "exact", head: true })
      .eq("meal_plan_id", planId);
    if (error) throw error;
    expect(count).toBe(0);
    // A check on the deleted plan is refused.
    expect(await setCheckIn(user.db, planId, key, true)).toBe("plan_changed");
  });

  it("writes nothing when the plan was switched just before the check", async () => {
    const user = await createTestUser("shopping-check-switched");
    const { planId, key } = await planWithLine(user);
    await setCheckIn(user.db, planId, key, true);
    // Another tab: "Ny matsedel", while this list still shows the old plan.
    const fresh = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    expect(await setCheckIn(user.db, planId, `r:${key.split(":")[1]}:st`, true)).toBe("plan_changed");
    expect(await setCheckIn(user.db, planId, key, false)).toBe("plan_changed");
    expect(await listChecksIn(user.db, planId)).toEqual([key]);
    expect(await listChecksIn(user.db, fresh.id)).toEqual([]);
    expect(await countRows("shopping_check", user.id)).toBe(1);
  });

  it("lets only a signed-in user run set_shopping_check, and refuses a key line-key.ts does not build", async () => {
    const user = await createTestUser("shopping-check-rpc");
    const { planId } = await planWithLine(user);
    const anon = await anonClient().rpc("set_shopping_check", { plan_id: planId, line_key: "t:salt", checked: true });
    expect(anon.error?.code).toBe("42501");
    const bad = await user.db.rpc("set_shopping_check", { plan_id: planId, line_key: "t:  salt", checked: true });
    expect(bad.error?.code).toBe("23514");
    expect(await countRows("shopping_check", user.id)).toBe(0);
  });
});

describe("shopping_custom_item", () => {
  async function addPlan(db: Db, isCurrent = true): Promise<string> {
    const { data, error } = await db.from("meal_plan").insert({ name: "Vecka 44", is_current: isCurrent }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  const item = (planId: string, changes: Partial<Parameters<typeof addCustomItemIn>[1]> = {}) => ({
    id: randomUUID(),
    planId,
    label: "diskmedel",
    ingredientId: null,
    amount: null,
    unit: null,
    ...changes,
  });

  /** One user and plan for the refused rows. */
  let checkUser: TestUser | undefined;
  let checkPlanId: string | undefined;

  it("isolates shopping_custom_item", async () => {
    await expectRlsIsolation("shopping_custom_item", async (owner) => ({
      meal_plan_id: await addPlan(owner),
      label: "diskmedel",
    }));
  });

  it("adds own items to the current plan's list: under Övrigt, or the linked ingredient's section, never merged", async () => {
    const user = await createTestUser("shopping-custom");
    const [gradde, kaffe] = await addIngredients(user.db, [
      { name: "Grädde", section: "Mejeri" },
      { name: "Kaffe", section: "Skafferi" },
    ]);
    const recipeId = await addRecipe(user.db, "Gryta", 4, [{ text: "3 dl grädde", ingredientId: gradde, amount: 3, unit: "dl" }]);
    await addDish(user.db, recipeId, "Gryta", 4);
    const planId = (await getCurrentPlanIn(user.db))!.id;

    const disk = item(planId, { amount: 2, unit: "förp" });
    expect(await addCustomItemIn(user.db, disk)).toEqual(disk);
    const coffee = item(planId, { label: "Kaffe", ingredientId: kaffe });
    await addCustomItemIn(user.db, coffee);
    const cream = item(planId, { label: "Grädde", ingredientId: gradde, amount: 1, unit: "dl" });
    await addCustomItemIn(user.db, cream);

    const list = await loadShoppingList(sources(user.db));
    expect(list.lines.map((line) => [line.section, line.key, line.label, line.amount, line.unit, line.isCustom])).toEqual([
      ["Mejeri", `c:${cream.id}`, "Grädde", 1, "dl", true],
      ["Mejeri", `r:${gradde}:dl`, "Grädde", 3, "dl", false],
      ["Skafferi", `c:${coffee.id}`, "Kaffe", null, null, true],
      ["Övrigt", `c:${disk.id}`, "diskmedel", 2, "förp", true],
    ]);

    // A retry with the same id and the same item adds nothing more.
    expect(await addCustomItemIn(user.db, disk)).toEqual(disk);
    expect(await countRows("shopping_custom_item", user.id)).toBe(3);
  });

  it("refuses a retry whose id was used for a different item, and writes nothing", async () => {
    const user = await createTestUser("shopping-custom-retry");
    const [kaffe] = await addIngredients(user.db, [{ name: "Kaffe", section: "Skafferi" }]);
    const planId = await addPlan(user.db);
    const disk = item(planId, { amount: 2, unit: "förp" });
    await addCustomItemIn(user.db, disk);
    for (const changed of [
      { label: "diskmedel extra" },
      { ingredientId: kaffe },
      { amount: 3 },
      { unit: "st" as const },
      { amount: null, unit: null },
    ]) {
      expect(await addCustomItemIn(user.db, { ...disk, ...changed }), JSON.stringify(changed)).toBe("plan_changed");
    }
    expect(await listCustomItemsIn(user.db, planId)).toEqual([
      { id: disk.id, label: "diskmedel", ingredientId: null, amount: 2, unit: "förp" },
    ]);
    // 2 and 2.0 are the same amount.
    const same = await user.db.rpc("add_shopping_custom_item", {
      item: { id: disk.id, meal_plan_id: planId, label: "diskmedel", ingredient_id: null, amount: "2.0", unit: "förp" },
    });
    expect(same.error).toBeNull();
  });

  it("leaves out a row the domain cannot read, with a log, and reads the rest of the list", async () => {
    const user = await createTestUser("shopping-custom-unreadable");
    const planId = await addPlan(user.db);
    const disk = item(planId);
    await addCustomItemIn(user.db, disk);
    // Postgres takes any 8-4-4-4-12 id; the app's ids are RFC 9562 uuids (z.uuid()).
    const odd = await user.db
      .from("shopping_custom_item")
      .insert({ id: "11111111-1111-1111-1111-111111111111", meal_plan_id: planId, label: "konstig" });
    expect(odd.error).toBeNull();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const list = await loadShoppingList(sources(user.db));
      expect(list.lines.map((line) => line.key)).toEqual([`c:${disk.id}`]);
      expect(log).toHaveBeenCalledWith("shopping_custom_item_unreadable", { reason: "invalid_custom_item" });
    } finally {
      log.mockRestore();
    }
  });

  it("keeps own items through a recount, and shows them without dishes and when the recipes are all at home", async () => {
    const user = await createTestUser("shopping-custom-recount");
    const [gradde] = await addIngredients(user.db, [{ name: "Grädde", section: "Mejeri" }]);
    const recipeId = await addRecipe(user.db, "Gryta", 4, [{ text: "3 dl grädde", ingredientId: gradde, amount: 3, unit: "dl" }]);
    const dishId = await addDish(user.db, recipeId, "Gryta", 4);
    const planId = (await getCurrentPlanIn(user.db))!.id;
    const disk = item(planId);
    await addCustomItemIn(user.db, disk);

    await setServingsIn(user.db, user.id, dishId, 8);
    await setPantry(user.db, [{ ingredientId: gradde, amount: 1, unit: "l" }, { ingredientId: gradde, amount: 6, unit: "dl" }]);
    expect((await loadShoppingList(sources(user.db))).lines.map((line) => line.key)).toEqual([`c:${disk.id}`]);

    const { error } = await user.db.from("meal_plan_recipe").delete().eq("id", dishId);
    if (error) throw error;
    const list = await loadShoppingList(sources(user.db));
    expect(list.plan?.dishCount).toBe(0);
    expect(list.lines.map((line) => line.label)).toEqual(["diskmedel"]);
  });

  it("removes an item for good and puts it back with the same id, section and check", async () => {
    const user = await createTestUser("shopping-custom-restore");
    const [kaffe] = await addIngredients(user.db, [{ name: "Kaffe", section: "Skafferi" }]);
    const planId = await addPlan(user.db);
    const coffee = item(planId, { label: "Kaffe", ingredientId: kaffe, amount: 2, unit: "förp" });
    await addCustomItemIn(user.db, coffee);
    expect(await setCheckIn(user.db, planId, `c:${coffee.id}`, true)).toBe("saved");

    const removed = await removeCustomItemIn(user.db, coffee.id);
    expect(removed).toEqual({ row: coffee });
    expect(await countRows("shopping_custom_item", user.id)).toBe(0);
    // The check stays without its line.
    expect(await listChecksIn(user.db, planId)).toEqual([`c:${coffee.id}`]);
    expect((await loadShoppingList(sources(user.db))).lines).toEqual([]);
    // Gone already: nothing to remove.
    expect(await removeCustomItemIn(user.db, coffee.id)).toBeNull();

    expect(await addCustomItemIn(user.db, coffee)).toEqual(coffee);
    expect((await loadShoppingList(sources(user.db))).lines.map((line) => [line.key, line.section, line.checked])).toEqual([
      [`c:${coffee.id}`, "Skafferi", true],
    ]);
  });

  it("writes nothing on a plan that is no longer the current one", async () => {
    const user = await createTestUser("shopping-custom-switched");
    const planId = await addPlan(user.db);
    const disk = item(planId);
    await addCustomItemIn(user.db, disk);
    // Another tab: "Ny matsedel", while this list still shows the old plan.
    await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    expect(await addCustomItemIn(user.db, item(planId))).toBe("plan_changed");
    expect(await removeCustomItemIn(user.db, disk.id)).toBe("plan_changed");
    expect(await countRows("shopping_custom_item", user.id)).toBe(1);
    // A plan that is gone.
    expect(await addCustomItemIn(user.db, item(randomUUID()))).toBe("plan_changed");
  });

  it("keeps a current plan with only own items as an earlier plan, with its items, and copies none to the new plan", async () => {
    const user = await createTestUser("shopping-custom-keep");
    const first = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 44" });
    const disk = item(first.id);
    await addCustomItemIn(user.db, disk);

    const second = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    const { data, error } = await user.db.from("meal_plan").select("id, is_current").order("created_at");
    if (error) throw error;
    expect(data).toEqual([
      { id: first.id, is_current: false },
      { id: second.id, is_current: true },
    ]);
    expect((await listCustomItemsIn(user.db, first.id)).map((own) => own.id)).toEqual([disk.id]);
    expect((await loadShoppingList(sources(user.db))).lines).toEqual([]);

    // A current plan without dishes and own items is still deleted on a switch.
    const third = await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 46" });
    const plans = await user.db.from("meal_plan").select("id");
    if (plans.error) throw plans.error;
    expect(plans.data.map((plan) => plan.id).sort()).toEqual([first.id, third.id].sort());
  });

  it("deletes the plan's own items with the plan", async () => {
    const user = await createTestUser("shopping-custom-cascade");
    const planId = await addPlan(user.db);
    await addCustomItemIn(user.db, item(planId));
    await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    expect(await deletePlanIn(user.db, planId)).toBe(true);
    expect(await countRows("shopping_custom_item", user.id)).toBe(0);
  });

  it("refuses another user's plan or ingredient (the composite foreign keys), and refuses deleting a linked ingredient", async () => {
    const owner = await createTestUser("shopping-custom-fk-owner");
    const other = await createTestUser("shopping-custom-fk-other");
    const [kaffe] = await addIngredients(owner.db, [{ name: "Kaffe", section: "Skafferi" }]);
    const ownerPlan = await addPlan(owner.db);
    const otherPlan = await addPlan(other.db);

    const onPlan = await other.db.from("shopping_custom_item").insert({ meal_plan_id: ownerPlan, label: "diskmedel" });
    expect(onPlan.error?.code).toBe("23503");
    const linked = await other.db.from("shopping_custom_item").insert({ meal_plan_id: otherPlan, label: "Kaffe", ingredient_id: kaffe });
    expect(linked.error?.code).toBe("23503");
    await expect(addCustomItemIn(other.db, item(otherPlan, { ingredientId: kaffe }))).rejects.toThrow(ShoppingDataError);
    expect(await addCustomItemIn(other.db, item(ownerPlan))).toBe("plan_changed");
    expect(await countRows("shopping_custom_item", other.id)).toBe(0);
    expect(await countRows("shopping_custom_item", owner.id)).toBe(0);

    // Deleting the linked ingredient is refused. In v1 ingredients cannot be
    // deleted at all (no grant, 42501), so this does not reach the restrict
    // foreign key; it shows only that the delete is refused.
    await addCustomItemIn(owner.db, item(ownerPlan, { ingredientId: kaffe }));
    const deleted = await adminClient().from("ingredient").delete().eq("id", kaffe);
    expect(["42501", "23503"]).toContain(deleted.error?.code);
    // Deleting the user still takes the item and the catalog with it.
    const gone = await adminClient().auth.admin.deleteUser(owner.id);
    expect(gone.error).toBeNull();
    expect(await countRows("shopping_custom_item", owner.id)).toBe(0);
    expect(await countRows("ingredient", owner.id)).toBe(0);
  });

  it.each([
    ["an empty text", { label: "  " }],
    ["an amount without a unit", { label: "a", amount: 2 }],
    ["a unit without an amount", { label: "a", unit: "st" }],
    ["a unit outside UNITS", { label: "a", amount: 2, unit: "liter" }],
    ["an amount of 0", { label: "a", amount: 0, unit: "st" }],
    ["an amount of a million", { label: "a", amount: 1_000_000, unit: "st" }],
    ["a text over 200 characters", { label: "a".repeat(201) }],
    ["a text of tabs and line breaks", { label: "\t\n\r" }],
    ["a text of Unicode spaces", { label: "\u00a0\u2003\u3000\ufeff" }],
  ])("refuses %s", async (_, row) => {
    checkUser ??= await createTestUser("shopping-custom-check");
    checkPlanId ??= await addPlan(checkUser.db);
    const { error } = await checkUser.db.from("shopping_custom_item").insert({ meal_plan_id: checkPlanId, ...row });
    expect(error?.code).toBe("23514");
  });

  it("counts the text's length in characters, as the domain does", async () => {
    checkUser ??= await createTestUser("shopping-custom-check");
    checkPlanId ??= await addPlan(checkUser.db);
    const { error } = await checkUser.db.from("shopping_custom_item").insert({ meal_plan_id: checkPlanId, label: "😀".repeat(200) });
    expect(error).toBeNull();
  });

  it("takes every unit in UNITS", async () => {
    const user = await createTestUser("shopping-custom-units");
    const planId = await addPlan(user.db);
    const { error } = await user.db
      .from("shopping_custom_item")
      .insert(UNITS.map((unit) => ({ meal_plan_id: planId, label: unit, amount: 1.5, unit })));
    expect(error).toBeNull();
    expect((await listCustomItemsIn(user.db, planId)).map((own) => own.unit).sort()).toEqual([...UNITS].sort());
  });

  it("lets only a signed-in user run the functions", async () => {
    const anon = anonClient();
    const add = await anon.rpc("add_shopping_custom_item", { item: { id: randomUUID(), meal_plan_id: randomUUID(), label: "a" } });
    expect(add.error?.code).toBe("42501");
    const remove = await anon.rpc("remove_shopping_custom_item", { item_id: randomUUID() });
    expect(remove.error?.code).toBe("42501");
  });
});

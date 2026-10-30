import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { UNITS, type Section, type Unit } from "@/features/catalog";
import { loadIngredientDefaults, loadIngredientNames } from "@/features/catalog/data/queries";
import { getCurrentPlanIn } from "@/features/mealplan/data/queries";
import { addWeeks, currentWeekStart } from "@/features/mealplan/domain/week";
import { addToCurrentPlanIn, deletePlanIn, setCurrentPlanIn, setServingsIn } from "@/features/mealplan/data/write";
import { addToPantryIn, findPantryAdditionsIn, forgetPantryAdditionsIn } from "@/features/pantry/data/add";
import { PantryDataError } from "@/features/pantry/data/client";
import { loadPantrySnapshot } from "@/features/pantry/data/queries";
import { getRecipesByIdsIn } from "@/features/recipes/data/queries";
import { recipeLineKey } from "@/features/shopping";
import { listCheckRowsIn, listChecksIn, setCheckIn } from "@/features/shopping/data/checks";
import { ShoppingDataError } from "@/features/shopping/data/client";
import {
  addCustomItemIn,
  listCustomItemsIn,
  removeCustomItemIn,
  updateCustomItemIn,
} from "@/features/shopping/data/custom-items";
import {
  listProductChoicesIn,
  removeProductChoiceIn,
  restoreProductChoiceIn,
  upsertProductChoiceIn,
} from "@/features/shopping/data/product-choices";
import { oneLine } from "@/features/settings";
import { productChoiceFormSchema, type ProductChoice, type ProductChoiceForm } from "@/features/shopping";
import { refusedCodePoints } from "@/lib/one-line";
import {
  hideLineIn,
  listOverridesIn,
  restoreLineIn,
  setLineAmountIn,
  showLineIn,
} from "@/features/shopping/data/overrides";
import type { HiddenLine } from "@/features/shopping";
import { clearPutInPantryIn, putInPantryWith, type PutInPantryDeps } from "@/features/shopping/data/put-in-pantry";
import { loadShoppingList, type ShoppingSources } from "@/features/shopping/data/queries";
import { fail, ok } from "@/lib/errors";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, countRows, createTestUser, deleteTestUsers, expectRlsIsolation, type Db, type TestUser } from "./support";

// The shopping list against local Supabase (FR-15, AD-8): counted from a real
// meal plan, recipes, pantry and catalog through the modules' read functions,
// with the user's session client, as getShoppingList does it. The list is
// never stored; only the checks (Story 3.4, shopping_check), Pontus's own
// items (Story 3.5, shopping_custom_item) and their corrected amounts and hidden
// lines (Story 3.6, shopping_line_override) are, and beside the list the
// product choices per catalog ingredient and store (Story 7.2,
// product_choice). NFR7: 10 dishes against 200
// pantry items within a second. "Lägg i lagret" (Story 3.7) runs the whole
// flow against the real tables: pantry.addToPantry, then clear_put_in_pantry.

/** The modules' read functions with the test user's client, as the server entries give them. */
const sources = (db: Db): ShoppingSources => ({
  currentPlan: () => getCurrentPlanIn(db),
  recipesByIds: (ids) => getRecipesByIdsIn(db, ids),
  pantry: () => loadPantrySnapshot(db),
  ingredientNames: (ids) => loadIngredientNames(db, ids),
  ingredientDefaults: (ids) => loadIngredientDefaults(db, ids),
  checks: (planId) => listChecksIn(db, planId),
  customItems: (planId) => listCustomItemsIn(db, planId),
  overrides: (planId) => listOverridesIn(db, planId),
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
      hiddenLines: [],
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
    const { data, error } = await db
      .from("meal_plan")
      .insert({ name: "Vecka 44", is_current: isCurrent, ...(isCurrent ? { week_start: currentWeekStart() } : {}) })
      .select("id")
      .single();
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
    const { data, error } = await db
      .from("meal_plan")
      .insert({ name: "Vecka 44", is_current: isCurrent, ...(isCurrent ? { week_start: currentWeekStart() } : {}) })
      .select("id")
      .single();
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

describe("shopping_line_override", () => {
  async function addPlan(db: Db, isCurrent = true): Promise<string> {
    const { data, error } = await db
      .from("meal_plan")
      .insert({ name: "Vecka 44", is_current: isCurrent, ...(isCurrent ? { week_start: currentWeekStart() } : {}) })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  /** A current plan with one dish ("2 dl grädde" and "salt efter smak" for 4), and the keys of its lines. */
  async function planWithLines(user: TestUser) {
    const [gradde, salt] = await addIngredients(user.db, [
      { name: "Grädde", section: "Mejeri" },
      { name: "Salt", section: "Skafferi" },
    ]);
    const recipeId = await addRecipe(user.db, "Gryta", 4, [
      { text: "2 dl grädde", ingredientId: gradde, amount: 2, unit: "dl" },
      { text: "salt efter smak", ingredientId: salt, amount: null, unit: null, vague: true },
      { text: "2 citroner", ingredientId: null, amount: 2, unit: "st" },
    ]);
    const dishId = await addDish(user.db, recipeId, "Gryta", 4);
    const planId = (await getCurrentPlanIn(user.db))!.id;
    return { planId, dishId, gradde, key: `r:${gradde}:dl`, vagueKey: `r:${salt}:-`, textKey: "t:2 citroner" };
  }

  const shown = async (db: Db) =>
    (await loadShoppingList(sources(db))).lines.map((line) => [line.key, line.amount, line.computedAmount ?? null]);

  it("isolates shopping_line_override", async () => {
    await expectRlsIsolation("shopping_line_override", async (owner) => ({
      meal_plan_id: await addPlan(owner),
      line_key: "r:11111111-1111-4111-8111-111111111111:dl",
      amount: 2,
    }));
  });

  it("corrects an amount, keeps it through a recount with the same key, and goes back to the counted one", async () => {
    const user = await createTestUser("shopping-override-amount");
    const { planId, dishId, key, vagueKey, textKey } = await planWithLines(user);
    expect(await setLineAmountIn(user.db, planId, key, 1.5)).toBe("saved");
    expect(await shown(user.db)).toEqual([
      [key, 1.5, 2],
      [vagueKey, null, null],
      [textKey, null, null],
    ]);
    // 2 dl becomes 3 dl: the correction stays.
    await setServingsIn(user.db, user.id, dishId, 6);
    expect((await shown(user.db))[0]).toEqual([key, 1.5, 3]);
    // Saving again is one row.
    expect(await setLineAmountIn(user.db, planId, key, 1)).toBe("saved");
    expect(await countRows("shopping_line_override", user.id)).toBe(1);
    expect(await setLineAmountIn(user.db, planId, key, null)).toBe("saved");
    expect((await shown(user.db))[0]).toEqual([key, 3, null]);
    // Neither an amount nor hidden: no row left. Clearing again changes nothing.
    expect(await countRows("shopping_line_override", user.id)).toBe(0);
    expect(await setLineAmountIn(user.db, planId, key, null)).toBe("saved");
  });

  it("hides a line keeping its correction, and Ångra puts the same row back", async () => {
    const user = await createTestUser("shopping-override-hide");
    const { planId, key, vagueKey, textKey } = await planWithLines(user);
    await setLineAmountIn(user.db, planId, key, 1.5);
    const before = await user.db.from("shopping_line_override").select("id, updated_at").single();
    if (before.error) throw before.error;

    const hidden = await hideLineIn(user.db, planId, key);
    expect(hidden).toEqual({
      previous: { id: before.data.id, planId, key, amount: 1.5, baseAmount: null, hidden: false },
      hiddenUpdatedAt: expect.any(String),
    });
    expect((await shown(user.db)).map(([one]) => one)).toEqual([vagueKey, textKey]);
    // Hiding keeps the corrected amount, on the same row, and updated_at follows.
    const after = await user.db.from("shopping_line_override").select("id, amount, hidden, updated_at").single();
    expect(after.data).toMatchObject({ id: before.data.id, amount: 1.5, hidden: true });
    expect(after.data!.updated_at > before.data.updated_at).toBe(true);

    const { previous, hiddenUpdatedAt } = hidden as HiddenLine;
    expect(await restoreLineIn(user.db, planId, key, previous, hiddenUpdatedAt)).toBe("saved");
    expect(await restoreLineIn(user.db, planId, key, previous, hiddenUpdatedAt)).toBe("saved");
    expect((await shown(user.db))[0]).toEqual([key, 1.5, 2]);
    const restored = await user.db.from("shopping_line_override").select("id, amount, hidden");
    expect(restored.data).toEqual([{ id: before.data.id, amount: 1.5, hidden: false }]);

    // A line without an override: hiding gives null, and Ångra deletes the row.
    const vague = (await hideLineIn(user.db, planId, vagueKey)) as HiddenLine;
    expect(vague.previous).toBeNull();
    const text = (await hideLineIn(user.db, planId, textKey)) as HiddenLine;
    expect(text.previous).toBeNull();
    expect((await shown(user.db)).map(([one]) => one)).toEqual([key]);
    expect(await restoreLineIn(user.db, planId, vagueKey, null, vague.hiddenUpdatedAt)).toBe("saved");
    expect(await restoreLineIn(user.db, planId, textKey, null, text.hiddenUpdatedAt)).toBe("saved");
    expect(await countRows("shopping_line_override", user.id)).toBe(1);
  });

  it("keeps a hidden line hidden through a recount, and shows a new key for the same ingredient", async () => {
    const user = await createTestUser("shopping-override-recount");
    const { planId, dishId, gradde, key } = await planWithLines(user);
    await hideLineIn(user.db, planId, key);
    await setServingsIn(user.db, user.id, dishId, 8);
    expect((await shown(user.db)).map(([one]) => one)).not.toContain(key);
    const recipeId = await addRecipe(user.db, "Paj", 4, [{ text: "100 g grädde", ingredientId: gradde, amount: 100, unit: "g" }]);
    await addDish(user.db, recipeId, "Paj", 4);
    const keys = (await shown(user.db)).map(([one]) => one);
    expect(keys).toContain(`r:${gradde}:g`);
    expect(keys).not.toContain(key);
  });

  it("is one row per plan and key, and refuses an own item's key or an amount on a line without a unit", async () => {
    const user = await createTestUser("shopping-override-checks");
    const { planId, key, vagueKey, textKey } = await planWithLines(user);
    const first = await user.db.from("shopping_line_override").insert({ meal_plan_id: planId, line_key: key, hidden: true });
    expect(first.error).toBeNull();
    const second = await user.db.from("shopping_line_override").insert({ meal_plan_id: planId, line_key: key, amount: 2 });
    expect(second.error?.code).toBe("23505");

    const refused = [
      { line_key: `c:${randomUUID()}`, hidden: true },
      { line_key: "x:1", hidden: true },
      { line_key: `r:${randomUUID().toUpperCase()}:dl`, hidden: true },
      { line_key: "t: två  citroner", hidden: true },
      { line_key: vagueKey, amount: 2 },
      { line_key: textKey, amount: 2 },
      { line_key: `r:${randomUUID()}:dl`, amount: 0 },
      { line_key: `r:${randomUUID()}:dl`, amount: 1_000_000 },
    ];
    for (const row of refused) {
      const result = await user.db.from("shopping_line_override").insert({ meal_plan_id: planId, ...row });
      expect(result.error?.code, row.line_key).toBe("23514");
    }
    for (const unit of [...UNITS, "-"]) {
      const result = await user.db
        .from("shopping_line_override")
        .insert({ meal_plan_id: planId, line_key: `r:${randomUUID()}:${unit}`, hidden: true });
      expect(result.error, unit).toBeNull();
    }
    // Through the functions as well.
    await expect(setLineAmountIn(user.db, planId, vagueKey, 2)).rejects.toThrow(ShoppingDataError);
    await expect(hideLineIn(user.db, planId, `c:${randomUUID()}`)).rejects.toThrow(ShoppingDataError);
  });

  it("refuses another user's plan, and another line's row on Ångra", async () => {
    const owner = await createTestUser("shopping-override-fk-owner");
    const other = await createTestUser("shopping-override-fk-other");
    const ownerPlan = await addPlan(owner.db);
    const onPlan = await other.db
      .from("shopping_line_override")
      .insert({ meal_plan_id: ownerPlan, line_key: "r:11111111-1111-4111-8111-111111111111:dl", hidden: true });
    expect(onPlan.error?.code).toBe("23503");
    expect(await hideLineIn(other.db, ownerPlan, "r:11111111-1111-4111-8111-111111111111:dl")).toBe("plan_changed");

    const { planId, key } = await planWithLines(owner);
    await setLineAmountIn(owner.db, planId, key, 2);
    const hidden = await hideLineIn(owner.db, planId, key);
    if (hidden === "plan_changed" || hidden === "unrestorable" || !hidden.previous) throw new Error("expected the row before");
    const { previous } = hidden;
    const otherKey = `r:${randomUUID()}:dl`;
    await expect(restoreLineIn(owner.db, planId, otherKey, { ...previous, key: otherKey })).rejects.toThrow(ShoppingDataError);
    await expect(restoreLineIn(owner.db, planId, key, { ...previous, key: otherKey })).rejects.toThrow(ShoppingDataError);
  });

  it("writes nothing on a plan that is no longer the current one, and deletes the overrides with the plan", async () => {
    const user = await createTestUser("shopping-override-switched");
    const { planId, key } = await planWithLines(user);
    await setLineAmountIn(user.db, planId, key, 2);
    // Another tab: "Ny matsedel", while this list still shows the old plan.
    await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    expect(await setLineAmountIn(user.db, planId, key, 3)).toBe("plan_changed");
    expect(await setLineAmountIn(user.db, planId, key, null)).toBe("plan_changed");
    expect(await hideLineIn(user.db, planId, key)).toBe("plan_changed");
    expect(await restoreLineIn(user.db, planId, key, null)).toBe("plan_changed");
    expect(await showLineIn(user.db, planId, key)).toBe("plan_changed");
    expect(await listOverridesIn(user.db, planId)).toEqual([{ key, amount: 2, baseAmount: null, hidden: false }]);
    // A plan that is gone.
    expect(await setLineAmountIn(user.db, randomUUID(), key, 3)).toBe("plan_changed");

    expect(await deletePlanIn(user.db, planId)).toBe(true);
    expect(await countRows("shopping_line_override", user.id)).toBe(0);
  });

  it("changes an own item in place, keeping its id and check, only on the current plan", async () => {
    const user = await createTestUser("shopping-custom-update");
    const [kaffe] = await addIngredients(user.db, [{ name: "Kaffe", section: "Skafferi" }]);
    const planId = await addPlan(user.db);
    const disk = { id: randomUUID(), planId, label: "diskmedel", ingredientId: null, amount: null, unit: null };
    await addCustomItemIn(user.db, disk);
    await setCheckIn(user.db, planId, `c:${disk.id}`, true);

    const changed = { ...disk, label: "Kaffe bryggmalet", ingredientId: kaffe, amount: 2, unit: "förp" as const };
    expect(await updateCustomItemIn(user.db, changed)).toEqual(changed);
    expect(await updateCustomItemIn(user.db, changed)).toEqual(changed);
    expect(
      (await loadShoppingList(sources(user.db))).lines.map((line) => [line.key, line.label, line.section, line.linkedName, line.checked]),
    ).toEqual([[`c:${disk.id}`, "Kaffe bryggmalet", "Skafferi", "Kaffe", true]]);

    expect(await updateCustomItemIn(user.db, { ...changed, id: randomUUID() })).toBe("not_found");
    expect(await updateCustomItemIn(user.db, { ...changed, planId: randomUUID() })).toBe("plan_changed");
    const other = await createTestUser("shopping-custom-update-other");
    expect(await updateCustomItemIn(other.db, changed)).toBe("not_found");
    const otherKaffe = (await addIngredients(other.db, [{ name: "Kaffe", section: "Skafferi" }]))[0];
    await expect(updateCustomItemIn(user.db, { ...changed, ingredientId: otherKaffe })).rejects.toThrow(ShoppingDataError);

    await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    expect(await updateCustomItemIn(user.db, { ...changed, label: "te" })).toBe("plan_changed");
    expect((await listCustomItemsIn(user.db, planId))[0].label).toBe("Kaffe bryggmalet");
  });

  it("lets only a signed-in user run the functions", async () => {
    const anon = anonClient();
    const key = "r:11111111-1111-4111-8111-111111111111:dl";
    const results = await Promise.all([
      anon.rpc("set_shopping_line_amount", { plan_id: randomUUID(), line_key: key, amount: 2 }),
      anon.rpc("hide_shopping_line", { plan_id: randomUUID(), line_key: key }),
      anon.rpc("restore_shopping_line", { plan_id: randomUUID(), line_key: key, previous: null }),
      anon.rpc("show_shopping_line", { plan_id: randomUUID(), line_key: key }),
      anon.rpc("update_shopping_custom_item", { item: { id: randomUUID(), meal_plan_id: randomUUID(), label: "a" } }),
    ]);
    expect(results.map((result) => result.error?.code)).toEqual(["42501", "42501", "42501", "42501", "42501"]);
  });

  it("brings the line back with Ångra after a second hide, and leaves no empty row", async () => {
    const user = await createTestUser("shopping-override-double-hide");
    const { planId, key, vagueKey } = await planWithLines(user);
    await setLineAmountIn(user.db, planId, key, 1.5);
    const first = (await hideLineIn(user.db, planId, key)) as HiddenLine;
    // A second hide (another tap, or a retry after a lost answer) gives the row as not hidden.
    const second = (await hideLineIn(user.db, planId, key)) as HiddenLine;
    expect(second.previous).toMatchObject({ id: first.previous!.id, amount: 1.5, hidden: false });
    expect(await restoreLineIn(user.db, planId, key, second.previous, second.hiddenUpdatedAt)).toBe("saved");
    expect((await shown(user.db))[0]).toEqual([key, 1.5, 2]);

    // A line without an override, hidden twice: Ångra leaves no row with neither an amount nor hidden.
    await hideLineIn(user.db, planId, vagueKey);
    const again = (await hideLineIn(user.db, planId, vagueKey)) as HiddenLine;
    expect(again.previous).toMatchObject({ amount: null, hidden: false });
    expect(await restoreLineIn(user.db, planId, vagueKey, again.previous, again.hiddenUpdatedAt)).toBe("saved");
    expect(await listOverridesIn(user.db, planId)).toEqual([{ key, amount: 1.5, baseAmount: null, hidden: false }]);
  });

  it("keeps a correction made after the hide when Ångra comes, and only shows the line again", async () => {
    const user = await createTestUser("shopping-override-concurrent");
    const { planId, key } = await planWithLines(user);
    const hidden = (await hideLineIn(user.db, planId, key)) as HiddenLine;
    expect(hidden.previous).toBeNull();
    // Another tab corrects the hidden line before "Ångra".
    expect(await setLineAmountIn(user.db, planId, key, 5, 2)).toBe("saved");
    expect(await restoreLineIn(user.db, planId, key, hidden.previous, hidden.hiddenUpdatedAt)).toBe("saved");
    expect(await listOverridesIn(user.db, planId)).toEqual([{ key, amount: 5, baseAmount: 2, hidden: false }]);
    expect((await shown(user.db))[0]).toEqual([key, 5, 2]);

    // With a row before: a change after the hide keeps the new amount, not the old one.
    const again = (await hideLineIn(user.db, planId, key)) as HiddenLine;
    expect(await setLineAmountIn(user.db, planId, key, 7, 2)).toBe("saved");
    expect(await restoreLineIn(user.db, planId, key, again.previous, again.hiddenUpdatedAt)).toBe("saved");
    expect(await listOverridesIn(user.db, planId)).toEqual([{ key, amount: 7, baseAmount: 2, hidden: false }]);

    // Cleared elsewhere after the hide: the line is shown already, and nothing comes back.
    const third = (await hideLineIn(user.db, planId, key)) as HiddenLine;
    await showLineIn(user.db, planId, key);
    await setLineAmountIn(user.db, planId, key, null);
    expect(await restoreLineIn(user.db, planId, key, third.previous, third.hiddenUpdatedAt)).toBe("saved");
    expect(await listOverridesIn(user.db, planId)).toEqual([]);
  });

  it("stores the counted amount beside a correction, and the list says when it has changed", async () => {
    const user = await createTestUser("shopping-override-base");
    const { planId, dishId, key } = await planWithLines(user);
    expect(await setLineAmountIn(user.db, planId, key, 1.5, 2)).toBe("saved");
    expect(await listOverridesIn(user.db, planId)).toEqual([{ key, amount: 1.5, baseAmount: 2, hidden: false }]);
    let line = (await loadShoppingList(sources(user.db))).lines[0];
    expect(line).toMatchObject({ amount: 1.5, computedAmount: 2 });
    expect(line).not.toHaveProperty("computedChanged");
    await setServingsIn(user.db, user.id, dishId, 6);
    line = (await loadShoppingList(sources(user.db))).lines[0];
    expect(line).toMatchObject({ amount: 1.5, computedAmount: 3, computedChanged: true });
    // Back to the counted amount: the base goes with it.
    await setLineAmountIn(user.db, planId, key, null);
    expect(await countRows("shopping_line_override", user.id)).toBe(0);
    const refused = await user.db
      .from("shopping_line_override")
      .insert({ meal_plan_id: planId, line_key: key, hidden: true, base_amount: 2 });
    expect(refused.error?.code).toBe("23514");
  });

  it("lists hidden lines for Dolda varor and shows one again with its correction", async () => {
    const user = await createTestUser("shopping-override-show");
    const { planId, key, vagueKey, textKey } = await planWithLines(user);
    await setLineAmountIn(user.db, planId, key, 1.5, 2);
    await hideLineIn(user.db, planId, key);
    await hideLineIn(user.db, planId, vagueKey);
    const list = await loadShoppingList(sources(user.db));
    expect(list.lines.map((line) => line.key)).toEqual([textKey]);
    expect(list.hiddenLines.map((line) => [line.key, line.label, line.amount])).toEqual([
      [key, "Grädde", 1.5],
      [vagueKey, "Salt", null],
    ]);

    expect(await showLineIn(user.db, planId, key)).toBe("saved");
    expect(await showLineIn(user.db, planId, vagueKey)).toBe("saved");
    expect(await showLineIn(user.db, planId, vagueKey)).toBe("saved");
    const after = await loadShoppingList(sources(user.db));
    expect(after.lines.map((line) => [line.key, line.amount])).toEqual([
      [key, 1.5],
      [vagueKey, null],
      [textKey, null],
    ]);
    expect(after.hiddenLines).toEqual([]);
    // The vague line's row had nothing but hidden: it is gone.
    expect(await listOverridesIn(user.db, planId)).toEqual([{ key, amount: 1.5, baseAmount: 2, hidden: false }]);
  });

  it("reads every override of a plan, page by page", async () => {
    const user = await createTestUser("shopping-override-pages");
    const planId = await addPlan(user.db);
    const rows = Array.from({ length: 1005 }, () => ({
      meal_plan_id: planId,
      line_key: `r:${randomUUID()}:dl`,
      hidden: true,
    }));
    const { error } = await user.db.from("shopping_line_override").insert(rows);
    if (error) throw error;
    expect(await listOverridesIn(user.db, planId)).toHaveLength(1005);
  });
});

describe("Lägg i lagret", () => {
  /** The flow's dependencies with the test user's client, as putCheckedInPantry gives them. */
  const flow = (user: TestUser, change: Partial<PutInPantryDeps> = {}): PutInPantryDeps => {
    const all = sources(user.db);
    return {
      sources: {
        currentPlan: all.currentPlan,
        recipesByIds: all.recipesByIds,
        pantry: all.pantry,
        ingredientNames: all.ingredientNames,
        ingredientDefaults: all.ingredientDefaults,
        customItems: all.customItems,
        overrides: all.overrides,
      },
      checkRows: (planId) => listCheckRowsIn(user.db, planId),
      findAdditions: (keys) => findPantryAdditionsIn(user.db, keys),
      addToPantry: async (items) => {
        try {
          return ok({ added: await addToPantryIn(user.db, items, (ids) => loadIngredientDefaults(user.db, ids)) });
        } catch (error) {
          if (!(error instanceof PantryDataError)) throw error;
          return fail("pantry_add_failed");
        }
      },
      clear: (planId, cleared) => clearPutInPantryIn(user.db, planId, cleared),
      forgetAdditions: (keys) => forgetPantryAdditionsIn(user.db, keys),
      ...change,
    };
  };

  /**
   * A current plan with "Gryta" for 4: 5 dl grädde, 2 dl mjöl, 2 paprika,
   * salt efter smak and "En näve persilja"; at home 2 dl grädde (Kyl) and
   * 1 kg mjöl (Skafferi); own items "kaffe" (linked, no amount) and
   * "diskmedel". Every line is checked off but paprika; grädde is corrected
   * to 1 dl.
   */
  async function scenario(name: string, { checkPaprika = false } = {}) {
    const user = await createTestUser(name);
    const { data, error } = await user.db
      .from("ingredient")
      .insert(
        (
          [
            ["Grädde", "Mejeri", "Kyl"],
            ["Mjöl", "Skafferi", "Skafferi"],
            ["Paprika", "Frukt och grönt", "Kyl"],
            ["Salt", "Skafferi", "Skafferi"],
            ["Kaffe", "Skafferi", "Skafferi"],
          ] as const
        ).map(([ingredient, section, location]) => ({
          name: ingredient,
          normalized_name: ingredient.toLowerCase(),
          section,
          location,
        })),
      )
      .select("id, name");
    if (error) throw error;
    const id = Object.fromEntries(data.map((row) => [row.name, row.id])) as Record<
      "Grädde" | "Mjöl" | "Paprika" | "Salt" | "Kaffe",
      string
    >;
    const recipeId = await addRecipe(user.db, "Gryta", 4, [
      { text: "5 dl grädde", ingredientId: id.Grädde, amount: 5, unit: "dl" },
      { text: "2 dl mjöl", ingredientId: id.Mjöl, amount: 2, unit: "dl" },
      { text: "2 paprikor", ingredientId: id.Paprika, amount: 2, unit: "st" },
      { text: "salt efter smak", ingredientId: id.Salt, amount: null, unit: null, vague: true },
      { text: "En näve persilja", ingredientId: null, amount: null, unit: null, vague: true },
    ]);
    await addDish(user.db, recipeId, "Gryta", 4);
    await setPantry(user.db, [
      { ingredientId: id.Grädde, amount: 2, unit: "dl", location: "Kyl" },
      { ingredientId: id.Mjöl, amount: 1, unit: "kg", location: "Skafferi" },
    ]);
    const planId = (await getCurrentPlanIn(user.db))!.id;
    const kaffe = await addCustomItemIn(user.db, {
      id: randomUUID(),
      planId,
      label: "kaffe",
      ingredientId: id.Kaffe,
      amount: null,
      unit: null,
    });
    const disk = await addCustomItemIn(user.db, {
      id: randomUUID(),
      planId,
      label: "diskmedel",
      ingredientId: null,
      amount: null,
      unit: null,
    });
    if (kaffe === "plan_changed" || disk === "plan_changed") throw new Error("no current plan");
    const keys = {
      gradde: recipeLineKey(id.Grädde, "dl"),
      mjol: recipeLineKey(id.Mjöl, "dl"),
      paprika: recipeLineKey(id.Paprika, "st"),
      salt: recipeLineKey(id.Salt, null),
      text: "t:en näve persilja",
      kaffe: `c:${kaffe.id}`,
      disk: `c:${disk.id}`,
    };
    for (const key of [keys.gradde, keys.mjol, keys.salt, keys.text, keys.kaffe, keys.disk]) {
      await setCheckIn(user.db, planId, key, true);
    }
    if (checkPaprika) await setCheckIn(user.db, planId, keys.paprika, true);
    await setLineAmountIn(user.db, planId, keys.gradde, 1);
    return { user, id, planId, keys };
  }

  /** The pantry by ingredient name, comparable across users. */
  async function pantryOf(user: TestUser, id: Record<string, string>) {
    const names = Object.fromEntries(Object.entries(id).map(([name, ingredientId]) => [ingredientId, name]));
    const { data, error } = await adminClient()
      .from("pantry_item")
      .select("ingredient_id, location, amount, unit")
      .eq("user_id", user.id);
    if (error) throw error;
    return data
      .map((row) => ({
        name: names[row.ingredient_id],
        location: row.location,
        amount: row.amount === null ? null : Number(row.amount),
        unit: row.unit,
      }))
      .sort((a, b) => `${a.name} ${a.unit}`.localeCompare(`${b.name} ${b.unit}`));
  }

  const listOf = async (user: TestUser) =>
    (await loadShoppingList(sources(user.db))).lines.map((line) => [line.label, line.amount, line.unit, line.checked]);

  const failingClear = async () => Promise.reject(new ShoppingDataError("clear_failed 08006", "08006"));

  it("puts the checked lines in the pantry at the catalog's locations, and takes them off the list", async () => {
    const { user, id, planId } = await scenario("shopping-put");
    expect(await putInPantryWith(flow(user), planId)).toEqual({
      kind: "done",
      added: 4,
      removed: 1,
      skipped: 0,
      pantryWritten: true,
      handled: 4,
    });
    expect(await pantryOf(user, id)).toEqual([
      // 2 dl at home and the corrected 1 dl.
      { name: "Grädde", location: "Kyl", amount: 3, unit: "dl" },
      { name: "Kaffe", location: "Skafferi", amount: null, unit: null },
      // A new row beside the 1 kg.
      { name: "Mjöl", location: "Skafferi", amount: 2, unit: "dl" },
      { name: "Mjöl", location: "Skafferi", amount: 1, unit: "kg" },
      { name: "Salt", location: "Skafferi", amount: null, unit: null },
    ]);
    // Grädde comes back unchecked with what is still short; the text line keeps its check; own items are gone.
    expect(await listOf(user)).toEqual([
      ["Paprika", 2, "st", false],
      ["Grädde", 2, "dl", false],
      ["En näve persilja", null, null, true],
    ]);
    expect(await countRows("shopping_check", user.id)).toBe(1);
    expect(await countRows("shopping_line_override", user.id)).toBe(0);
    expect(await countRows("shopping_custom_item", user.id)).toBe(0);
    // The cleared checks' receipts are forgotten.
    expect(await countRows("pantry_addition", user.id)).toBe(0);
  });

  it("leaves the same pantry and list after an interruption and a second run as after one run", async () => {
    const once = await scenario("shopping-put-once", { checkPaprika: true });
    await putInPantryWith(flow(once.user), once.planId);

    const twice = await scenario("shopping-put-twice", { checkPaprika: true });
    const clear = vi.fn(failingClear);
    expect(await putInPantryWith(flow(twice.user, { clear }), twice.planId)).toEqual({
      kind: "clear_failed",
      detail: "clear_failed 08006",
      pantryWritten: true,
    });
    // Tried twice. The pantry is written and keeps its receipts; the checks stay. Paprika is covered now,
    // so its line is gone with its check left.
    expect(clear).toHaveBeenCalledTimes(2);
    expect(await countRows("shopping_check", twice.user.id)).toBe(7);
    expect(await countRows("pantry_addition", twice.user.id)).toBe(5);
    // Mjöl, salt and paprika are covered now: only grädde (still short) and kaffe are on the list, and both have receipts.
    expect(await putInPantryWith(flow(twice.user), twice.planId)).toEqual({
      kind: "done",
      added: 2,
      removed: 1,
      skipped: 0,
      pantryWritten: true,
      // Both have receipts from the first run: the pantry takes in nothing.
      handled: 0,
    });

    expect(await pantryOf(twice.user, twice.id)).toEqual(await pantryOf(once.user, once.id));
    expect(await listOf(twice.user)).toEqual(await listOf(once.user));
    expect(await countRows("shopping_check", twice.user.id)).toBe(1);
    expect(await countRows("shopping_line_override", twice.user.id)).toBe(0);
    expect(await countRows("pantry_addition", twice.user.id)).toBe(0);
  });

  it("keeps a line hidden after a failed clear hidden through the retry, clearing only its check", async () => {
    const { user, planId, keys } = await scenario("shopping-put-hidden-retry");
    await putInPantryWith(flow(user, { clear: failingClear }), planId);
    // Grädde (corrected to 1 dl) was put in the pantry; now Pontus hides its line.
    expect(await hideLineIn(user.db, planId, keys.gradde)).not.toBe("plan_changed");
    expect(await putInPantryWith(flow(user), planId)).toMatchObject({ kind: "done" });
    const overrides = await listOverridesIn(user.db, planId);
    expect(overrides).toEqual([{ key: keys.gradde, amount: 1, baseAmount: null, hidden: true }]);
    expect((await listCheckRowsIn(user.db, planId)).map((check) => check.key)).toEqual([keys.text]);
  });

  it("leaves a hidden line and a check without receipt as they are", async () => {
    const { user, planId, id, keys } = await scenario("shopping-put-untouched");
    await setCheckIn(user.db, planId, keys.paprika, true);
    expect(await hideLineIn(user.db, planId, keys.paprika)).not.toBe("plan_changed");
    const orphan = recipeLineKey(id.Paprika, "kg");
    await setCheckIn(user.db, planId, orphan, true);
    expect(await putInPantryWith(flow(user), planId)).toMatchObject({ kind: "done", added: 4 });
    expect((await listCheckRowsIn(user.db, planId)).map((check) => check.key).sort()).toEqual(
      [keys.text, keys.paprika, orphan].sort(),
    );
    expect(await listOverridesIn(user.db, planId)).toEqual([
      { key: keys.paprika, amount: null, baseAmount: null, hidden: true },
    ]);
  });

  it("keeps the checks and adds nothing when the pantry refuses", async () => {
    const { user, id, planId } = await scenario("shopping-put-pantry-fails");
    const before = await pantryOf(user, id);
    const result = await putInPantryWith(flow(user, { addToPantry: async () => fail("pantry_add_failed") }), planId);
    expect(result).toEqual({ kind: "pantry_failed", error: fail("pantry_add_failed").error });
    expect(await pantryOf(user, id)).toEqual(before);
    expect(await countRows("shopping_check", user.id)).toBe(6);
    expect(await countRows("shopping_custom_item", user.id)).toBe(2);
  });

  it("adds once when a second run reaches the pantry before the first has cleared (a double tap, or two devices)", async () => {
    const once = await scenario("shopping-put-single");
    await putInPantryWith(flow(once.user), once.planId);
    const both = await scenario("shopping-put-double");
    // The first run clears only after the second has been to the pantry, which the receipts then hold back.
    let secondAdded: () => void = () => {};
    const added = new Promise<void>((resolve) => (secondAdded = resolve));
    const first = flow(both.user, {
      clear: async (planId, cleared) => {
        await added;
        return clearPutInPantryIn(both.user.db, planId, cleared);
      },
    });
    const second = flow(both.user);
    const plainAdd = second.addToPantry;
    second.addToPantry = async (items) => {
      const result = await plainAdd(items);
      secondAdded();
      return result;
    };
    await Promise.all([putInPantryWith(first, both.planId), putInPantryWith(second, both.planId)]);
    expect(await pantryOf(both.user, both.id)).toEqual(await pantryOf(once.user, once.id));
    expect(await countRows("shopping_check", both.user.id)).toBe(1);
  });

  it("writes nothing for a plan that is no longer the current one", async () => {
    const { user, id, planId, keys } = await scenario("shopping-put-old-plan");
    const before = await pantryOf(user, id);
    expect(await putInPantryWith(flow(user), randomUUID())).toEqual({ kind: "plan_changed", pantryWritten: false });
    // The plan switched between counting and clearing: the database refuses the clearing.
    const [check] = await listCheckRowsIn(user.db, planId);
    await setCurrentPlanIn(user.db, { id: randomUUID(), name: "Vecka 45" });
    expect(
      await clearPutInPantryIn(user.db, planId, { checkIds: [check!.id], overrideKeys: [keys.salt], customItemIds: [] }),
    ).toBe("plan_changed");
    expect(await pantryOf(user, id)).toEqual(before);
    expect(await countRows("shopping_check", user.id)).toBe(6);
  });

  it("clears only the caller's own rows, and only for a signed-in user", async () => {
    const { user, planId, keys } = await scenario("shopping-put-rls");
    const other = await createTestUser("shopping-put-rls-other");
    const [check] = await listCheckRowsIn(user.db, planId);
    const args = { plan_id: planId, check_ids: [check!.id], override_keys: [keys.gradde], custom_item_ids: [keys.disk.slice(2)] };
    expect((await anonClient().rpc("clear_put_in_pantry", args)).error?.code).toBe("42501");
    expect((await other.db.rpc("clear_put_in_pantry", args)).error?.code).toBe("55000");
    expect((await adminClient().rpc("clear_put_in_pantry", args)).error?.code).toBe("42501");
    expect(await countRows("shopping_check", user.id)).toBe(6);
    expect(await countRows("shopping_custom_item", user.id)).toBe(2);
    expect(await countRows("shopping_line_override", user.id)).toBe(1);
  });
});

describe("product_choice", () => {
  const char = (code: number) => String.fromCodePoint(code);
  const hex = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
  /** Every code point the one-line checks refuse (src/lib/one-line.ts). */
  const refused = refusedCodePoints.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i));

  async function addStore(db: Db, name = "Maxi ICA Stormarknad Östersund", chain = "ICA"): Promise<string> {
    const { data, error } = await db.from("store").insert({ name, chain }).select("id").single();
    if (error) throw error;
    return data.id;
  }

  const form = (ingredientId: string, storeId: string, changes: Partial<ProductChoiceForm> = {}): ProductChoiceForm => ({
    ingredientId,
    storeId,
    productName: "Arla Matlagningsgrädde 15 %",
    packageSize: "5 dl",
    url: null,
    expected: null,
    ...changes,
  });

  /** Saves `choice` and returns the stored choice; fails the test on any other outcome. */
  async function save(db: Db, choice: ProductChoiceForm): Promise<ProductChoice> {
    const outcome = await upsertProductChoiceIn(db, choice);
    if (outcome.kind !== "saved" || !outcome.choice) throw new Error(`not saved: ${JSON.stringify(outcome)}`);
    return outcome.choice;
  }

  const expecting = (choice: ProductChoice) => ({ id: choice.id, updatedAt: choice.updatedAt });

  /** One user, ingredient and store for the refused rows. */
  let checkUser: TestUser | undefined;
  let checkRow: { ingredient_id: string; store_id: string } | undefined;
  async function checkTarget() {
    checkUser ??= await createTestUser("product-choice-check");
    if (!checkRow) {
      const [gradde] = await addIngredients(checkUser.db, [{ name: "Grädde", section: "Mejeri" }]);
      checkRow = { ingredient_id: gradde, store_id: await addStore(checkUser.db) };
    }
    return { user: checkUser, row: checkRow };
  }

  it("isolates product_choice", async () => {
    await expectRlsIsolation("product_choice", async (owner) => {
      const [gradde] = await addIngredients(owner, [{ name: "Grädde", section: "Mejeri" }]);
      return { ingredient_id: gradde, store_id: await addStore(owner), product_name: "Arla Matlagningsgrädde 15 %" };
    });
  });

  it("saves one choice per ingredient and store: a change keeps the row's id, and updated_at follows", async () => {
    const user = await createTestUser("product-choice-save");
    const [gradde, kaffe] = await addIngredients(user.db, [
      { name: "Grädde", section: "Mejeri" },
      { name: "Kaffe", section: "Skafferi" },
    ]);
    const maxi = await addStore(user.db);
    const saved = await save(user.db, form(gradde, maxi));
    expect(saved).toEqual({
      id: expect.any(String),
      ingredientId: gradde,
      storeId: maxi,
      productName: "Arla Matlagningsgrädde 15 %",
      packageSize: "5 dl",
      url: null,
      updatedAt: expect.any(String),
    });

    // A double tap, or a retry after a lost answer: the same fields give the same row, unwritten.
    expect(await save(user.db, form(gradde, maxi))).toEqual(saved);
    expect(await save(user.db, form(gradde, maxi, { expected: expecting(saved) }))).toEqual(saved);

    const changed = await save(
      user.db,
      form(gradde, maxi, { packageSize: null, url: "https://www.arla.se/produkter/matlagningsgradde", expected: expecting(saved) }),
    );
    expect(changed).toEqual({
      ...saved,
      packageSize: null,
      url: "https://www.arla.se/produkter/matlagningsgradde",
      updatedAt: expect.any(String),
    });
    expect(new Date(changed.updatedAt).getTime()).toBeGreaterThan(new Date(saved.updatedAt).getTime());
    expect(await countRows("product_choice", user.id)).toBe(1);

    const coffee = await save(user.db, form(kaffe, maxi, { productName: "Zoégas Skånerost", packageSize: "450 g" }));
    expect(await listProductChoicesIn(user.db, maxi)).toEqual({ choices: { [gradde]: changed, [kaffe]: coffee }, unreadable: [] });
  });

  it("writes nothing when the stored choice is not the expected one", async () => {
    const user = await createTestUser("product-choice-stale");
    const [gradde] = await addIngredients(user.db, [{ name: "Grädde", section: "Mejeri" }]);
    const maxi = await addStore(user.db);
    const first = await save(user.db, form(gradde, maxi));
    const second = await save(user.db, form(gradde, maxi, { packageSize: "2 dl", expected: expecting(first) }));

    // A sheet opened before the second save, or one that expected no choice.
    expect(await upsertProductChoiceIn(user.db, form(gradde, maxi, { packageSize: "1 l", expected: expecting(first) }))).toEqual({
      kind: "changed",
    });
    expect(await upsertProductChoiceIn(user.db, form(gradde, maxi, { packageSize: "1 l" }))).toEqual({ kind: "changed" });
    // A sheet whose choice was removed elsewhere.
    await removeProductChoiceIn(user.db, second.id);
    expect(await upsertProductChoiceIn(user.db, form(gradde, maxi, { packageSize: "1 l", expected: expecting(second) }))).toEqual({
      kind: "changed",
    });
    expect(await countRows("product_choice", user.id)).toBe(0);
  });

  it("saves one of two new choices at once, under the per-user lock, and refuses the other", async () => {
    const user = await createTestUser("product-choice-race");
    const [gradde] = await addIngredients(user.db, [{ name: "Grädde", section: "Mejeri" }]);
    const maxi = await addStore(user.db);
    const outcomes = await Promise.all([
      upsertProductChoiceIn(user.db, form(gradde, maxi, { productName: "Arla" })),
      upsertProductChoiceIn(user.db, form(gradde, maxi, { productName: "Garant" })),
    ]);
    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["changed", "saved"]);
    expect(await countRows("product_choice", user.id)).toBe(1);
  });

  it("lets the same ingredient have a choice in each of two stores, and lists each store's own", async () => {
    const user = await createTestUser("product-choice-stores");
    const [gradde] = await addIngredients(user.db, [{ name: "Grädde", section: "Mejeri" }]);
    const maxi = await addStore(user.db);
    const willys = await addStore(user.db, "Willys Lindhagen", "Willys");
    await save(user.db, form(gradde, maxi));
    await save(user.db, form(gradde, willys, { productName: "Garant Matlagningsgrädde", packageSize: "2 dl" }));
    expect(await countRows("product_choice", user.id)).toBe(2);
    expect((await listProductChoicesIn(user.db, maxi)).choices[gradde].productName).toBe("Arla Matlagningsgrädde 15 %");
    expect((await listProductChoicesIn(user.db, willys)).choices[gradde].productName).toBe("Garant Matlagningsgrädde");
    // A store without choices.
    expect(await listProductChoicesIn(user.db, await addStore(user.db, "Coop Forum", "Coop"))).toEqual({ choices: {}, unreadable: [] });
  });

  it("keeps one choice per ingredient and store (23505)", async () => {
    const user = await createTestUser("product-choice-unique");
    const [gradde] = await addIngredients(user.db, [{ name: "Grädde", section: "Mejeri" }]);
    const row = { ingredient_id: gradde, store_id: await addStore(user.db), product_name: "Arla" };
    expect((await user.db.from("product_choice").insert(row)).error).toBeNull();
    const again = await user.db.from("product_choice").insert({ ...row, product_name: "Garant" });
    expect(again.error?.code).toBe("23505");
    expect(again.error?.message).toContain("product_choice_user_id_ingredient_id_store_id_key");
  });

  it("refuses another user's ingredient or store (23503), and the save gives target_gone", async () => {
    const owner = await createTestUser("product-choice-fk-owner");
    const other = await createTestUser("product-choice-fk-other");
    const [ownerGradde] = await addIngredients(owner.db, [{ name: "Grädde", section: "Mejeri" }]);
    const [otherGradde] = await addIngredients(other.db, [{ name: "Grädde", section: "Mejeri" }]);
    const ownerStore = await addStore(owner.db);
    const otherStore = await addStore(other.db);

    const theirIngredient = await other.db.from("product_choice").insert({ ingredient_id: ownerGradde, store_id: otherStore, product_name: "Arla" });
    expect(theirIngredient.error?.code).toBe("23503");
    const theirStore = await other.db.from("product_choice").insert({ ingredient_id: otherGradde, store_id: ownerStore, product_name: "Arla" });
    expect(theirStore.error?.code).toBe("23503");
    expect(await upsertProductChoiceIn(other.db, form(ownerGradde, otherStore))).toEqual({ kind: "target_gone" });
    expect(await upsertProductChoiceIn(other.db, form(otherGradde, ownerStore))).toEqual({ kind: "target_gone" });
    expect(await countRows("product_choice", other.id)).toBe(0);
    expect(await countRows("product_choice", owner.id)).toBe(0);
  });

  it("lets only a signed-in user save through the function", async () => {
    const saved = await anonClient().rpc("save_product_choice", {
      choice: { ingredient_id: randomUUID(), store_id: randomUUID(), product_name: "Arla" },
      expected_id: null as unknown as string,
      expected_updated_at: null as unknown as string,
    });
    expect(saved.error?.code).toBe("42501");
  });

  it.each([
    ["an empty name", { product_name: "" }],
    ["a name of spaces", { product_name: "   " }],
    ["an untrimmed name", { product_name: " Arla" }],
    ["a name over 200 characters", { product_name: "a".repeat(201) }],
    ["an empty package size", { product_name: "Arla", package_size: "" }],
    ["a package size over 40 characters", { product_name: "Arla", package_size: "a".repeat(41) }],
    ["a link over 2048 characters", { product_name: "Arla", url: `https://arla.se/${"a".repeat(2048)}` }],
  ])("refuses %s (23514)", async (_, fields) => {
    const { user, row } = await checkTarget();
    const { error } = await user.db.from("product_choice").insert({ ...row, ...fields });
    expect(error?.code).toBe("23514");
  });

  it("refuses every refused character in the name, the package size and the link (23514), as the domain does", async () => {
    const { user, row } = await checkTarget();
    for (const code of refused) {
      for (const fields of [
        { product_name: `Arla${char(code)}grädde` },
        { product_name: "Arla", package_size: `5${char(code)}dl` },
        { product_name: "Arla", url: `https://www.arla.se/a${char(code)}b` },
      ]) {
        const { error } = await user.db.from("product_choice").insert({ ...row, ...fields });
        expect(error?.code, `${hex(code)} ${Object.keys(fields).join(",")}`).toBe("23514");
      }
    }
  });

  it.each(["arla.se/produkter", "http://www.arla.se/", "javascript:alert(1)", "data:text/html,x", "https://", "https:///produkter", "https://?q=1", "https://#x", "https://www.arla.se/a b"])(
    "refuses the link %s in product_choice and store (23514)",
    async (url) => {
      const { user, row } = await checkTarget();
      expect((await user.db.from("product_choice").insert({ ...row, product_name: "Arla", url })).error?.code).toBe("23514");
      expect((await user.db.from("store").insert({ name: "Maxi", chain: "ICA", url })).error?.code).toBe("23514");
    },
  );

  it("refuses every refused character in a store's name, id, address and URL (23514)", async () => {
    const { user } = await checkTarget();
    for (const code of refused) {
      for (const fields of [
        { name: `Maxi${char(code)}ICA` },
        { name: "Maxi", external_store_id: `10${char(code)}03` },
        { name: "Maxi", address: `Gatan${char(code)}1` },
        { name: "Maxi", url: `https://butik.example/a${char(code)}b` },
      ]) {
        const { error } = await user.db.from("store").insert({ chain: "Annan", ...fields });
        expect(error?.code, `${hex(code)} ${Object.keys(fields).join(",")}`).toBe("23514");
      }
    }
  });

  it("stores what the form's schema leaves of any text, counted in characters", async () => {
    const { user, row } = await checkTarget();
    const parsed = productChoiceFormSchema.parse({
      ingredientId: row.ingredient_id,
      storeId: row.store_id,
      productName: `${char(0x202e)} Arla${char(0x2028)}Mat${char(0x07)}gr${char(0x200b)}ädde ${"🥛".repeat(150)} `,
      packageSize: `5${char(0x0a)}${char(0x2066)}${char(0xfeff)}dl`,
      url: " Https://www.arla.se/produkter ",
      expected: null,
    });
    expect(parsed.productName).toBe(oneLine(parsed.productName));
    const outcome = await upsertProductChoiceIn(user.db, parsed);
    expect(outcome).toEqual({
      kind: "saved",
      choice: expect.objectContaining({ productName: expect.stringMatching(/^Arla Mat grädde /), packageSize: "5 dl", url: "https://www.arla.se/produkter" }),
    });
    // 200 emoji are 200 characters.
    const emoji = await user.db
      .from("product_choice")
      .update({ product_name: "🥛".repeat(200) })
      .eq("ingredient_id", row.ingredient_id)
      .select("id");
    expect(emoji.error).toBeNull();
  });

  it("removes a choice and puts the same row back with Ångra; Ångra twice puts it back once", async () => {
    const user = await createTestUser("product-choice-undo");
    const [gradde] = await addIngredients(user.db, [{ name: "Grädde", section: "Mejeri" }]);
    const maxi = await addStore(user.db);
    const saved = await save(user.db, form(gradde, maxi, { url: "https://www.arla.se/" }));

    expect(await removeProductChoiceIn(user.db, saved.id)).toEqual({ row: saved });
    expect(await countRows("product_choice", user.id)).toBe(0);
    // Gone already: nothing to remove.
    expect(await removeProductChoiceIn(user.db, saved.id)).toBeNull();

    const same = { ...saved, updatedAt: expect.any(String) };
    expect(await restoreProductChoiceIn(user.db, saved)).toEqual(same);
    expect(await restoreProductChoiceIn(user.db, saved)).toEqual(same);
    expect((await listProductChoicesIn(user.db, maxi)).choices).toEqual({ [gradde]: same });
  });

  it("keeps a choice saved after the removal, and gives conflict for Ångra", async () => {
    const user = await createTestUser("product-choice-undo-conflict");
    const [gradde] = await addIngredients(user.db, [{ name: "Grädde", section: "Mejeri" }]);
    const maxi = await addStore(user.db);
    const saved = await save(user.db, form(gradde, maxi));
    await removeProductChoiceIn(user.db, saved.id);
    const newer = await save(user.db, form(gradde, maxi, { productName: "Garant", packageSize: null }));
    expect(await restoreProductChoiceIn(user.db, saved)).toBe("conflict");
    expect((await listProductChoicesIn(user.db, maxi)).choices).toEqual({ [gradde]: newer });
  });

  it("gives conflict for Ångra with an id another user has, and touches nothing of theirs", async () => {
    const owner = await createTestUser("product-choice-undo-owner");
    const other = await createTestUser("product-choice-undo-other");
    const [ownerGradde] = await addIngredients(owner.db, [{ name: "Grädde", section: "Mejeri" }]);
    const [otherGradde] = await addIngredients(other.db, [{ name: "Grädde", section: "Mejeri" }]);
    const saved = await save(owner.db, form(ownerGradde, await addStore(owner.db)));
    const otherStore = await addStore(other.db);
    expect(await restoreProductChoiceIn(other.db, { ...saved, ingredientId: otherGradde, storeId: otherStore })).toBe("conflict");
    expect(await removeProductChoiceIn(other.db, saved.id)).toBeNull();
    expect(await countRows("product_choice", owner.id)).toBe(1);
    expect(await countRows("product_choice", other.id)).toBe(0);
  });

  it("keeps the store and the ingredient while a choice points at them, and goes with the user", async () => {
    const user = await createTestUser("product-choice-restrict");
    const [gradde] = await addIngredients(user.db, [{ name: "Grädde", section: "Mejeri" }]);
    const maxi = await addStore(user.db);
    await save(user.db, form(gradde, maxi));

    // The store: refused by the restrict foreign key (stores are never deleted in v1 either).
    const store = await adminClient().from("store").delete().eq("id", maxi);
    expect(store.error?.code).toBe("23503");
    expect(store.error?.message).toContain("product_choice_store_fkey");
    // The ingredient: catalog ingredients cannot be deleted at all in v1 (no
    // grant, 42501), so this may not reach the restrict foreign key; it shows
    // the delete is refused.
    const ingredient = await adminClient().from("ingredient").delete().eq("id", gradde);
    expect(["42501", "23503"]).toContain(ingredient.error?.code);
    expect(await countRows("product_choice", user.id)).toBe(1);

    // Deleting the user takes the choice, the store and the catalog with it.
    const gone = await adminClient().auth.admin.deleteUser(user.id);
    expect(gone.error).toBeNull();
    expect(await countRows("product_choice", user.id)).toBe(0);
    expect(await countRows("store", user.id)).toBe(0);
    expect(await countRows("ingredient", user.id)).toBe(0);
  });

  it("refuses a store id that is not an id before asking Postgres", async () => {
    const { user } = await checkTarget();
    await expect(listProductChoicesIn(user.db, "maxi")).rejects.toThrow(ShoppingDataError);
    await expect(removeProductChoiceIn(user.db, "x")).rejects.toThrow(ShoppingDataError);
  });
});

describe("the list of a coming week (Story 13.7)", () => {
  it("counts a coming week's plan on its own, with its own checks", async () => {
    const user = await createTestUser("shopping-week");
    const [gradde, lok] = await addIngredients(user.db, [
      { name: "Grädde", section: "Mejeri" },
      { name: "Lök", section: "Frukt och grönt" },
    ]);
    const now = await addRecipe(user.db, "Gryta", 4, [{ text: "3 dl grädde", ingredientId: gradde, amount: 3, unit: "dl" }]);
    const later = await addRecipe(user.db, "Soppa", 4, [{ text: "2 lök", ingredientId: lok, amount: 2, unit: "st" }]);
    await addDish(user.db, now, "Gryta", 4);
    const nextWeek = addWeeks(currentWeekStart(), 1);
    await addToCurrentPlanIn(user.db, {
      id: randomUUID(),
      recipeId: later,
      recipeTitle: "Soppa",
      servings: 4,
      planName: "Vecka 45",
      weekStart: nextWeek,
    });

    const thisWeek = await loadShoppingList(sources(user.db));
    const upcoming = await loadShoppingList({ ...sources(user.db), currentPlan: () => getCurrentPlanIn(user.db, nextWeek) });
    expect(thisWeek.lines.map((line) => line.label)).toEqual(["Grädde"]);
    expect(upcoming.lines.map((line) => line.label)).toEqual(["Lök"]);
    expect(upcoming.plan?.id).not.toBe(thisWeek.plan?.id);

    // A check on the coming week's plan is saved and stays on that plan.
    const key = upcoming.lines[0]!.key;
    expect(await setCheckIn(user.db, upcoming.plan!.id, key, true)).toBe("saved");
    expect(await listChecksIn(user.db, upcoming.plan!.id)).toEqual([key]);
    expect(await listChecksIn(user.db, thisWeek.plan!.id)).toEqual([]);
    const again = await loadShoppingList({ ...sources(user.db), currentPlan: () => getCurrentPlanIn(user.db, nextWeek) });
    expect(again.lines[0]?.checked).toBe(true);
    expect((await loadShoppingList(sources(user.db))).lines.every((line) => !line.checked)).toBe(true);

    // A week with no plan has no list.
    const empty = await loadShoppingList({ ...sources(user.db), currentPlan: () => getCurrentPlanIn(user.db, addWeeks(nextWeek, 3)) });
    expect(empty.plan).toBeNull();
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Section, Unit } from "@/features/catalog";
import { loadIngredientDefaults, loadIngredientNames } from "@/features/catalog/data/queries";
import { getCurrentPlanIn } from "@/features/mealplan/data/queries";
import { addToCurrentPlanIn, setServingsIn } from "@/features/mealplan/data/write";
import { loadPantrySnapshot } from "@/features/pantry/data/queries";
import { getRecipesByIdsIn } from "@/features/recipes/data/queries";
import { loadShoppingList, type ShoppingSources } from "@/features/shopping/data/queries";
import { localSupabaseUrl } from "../local-supabase";
import { createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// The shopping list against local Supabase (FR-15, AD-8): counted from a real
// meal plan, recipes, pantry and catalog through the modules' read functions,
// with the user's session client, as getShoppingList does it. Nothing is
// stored. NFR7: 10 dishes against 200 pantry items within a second.

/** The modules' read functions with the test user's client, as the server entries give them. */
const sources = (db: Db): ShoppingSources => ({
  currentPlan: () => getCurrentPlanIn(db),
  recipesByIds: (ids) => getRecipesByIdsIn(db, ids),
  pantry: () => loadPantrySnapshot(db),
  ingredientNames: (ids) => loadIngredientNames(db, ids),
  ingredientDefaults: (ids) => loadIngredientDefaults(db, ids),
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
    expect(await loadShoppingList(sources(empty.db))).toEqual({ plan: null, lines: [], pantryUnavailable: false });
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

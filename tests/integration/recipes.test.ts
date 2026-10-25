import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitIngredients } from "@/features/catalog/data/commit";
import { findIngredientIdsIn, loadIngredientNames } from "@/features/catalog/data/queries";
import type { RecipeDraft, RecipeLine, RecipeListItem, SaveRecipeArgs } from "@/features/recipes";
import { setFavoriteIn } from "@/features/recipes/data/favorite";
import { getRecipe, listRecipes, searchRecipesIn } from "@/features/recipes/data/queries";
import { saveRecipeIn } from "@/features/recipes/data/save";
import { localSupabaseUrl } from "../local-supabase";
import {
  adminClient,
  anonClient,
  countRows,
  createTestUser,
  deleteTestUsers,
  expectRlsIsolation,
  type Db,
  type TestUser,
} from "./support";

// The recipe tables against local Supabase (AD-4, AD-10, AD-20): RLS on all
// three, save_recipe saving everything or nothing, references that stay
// inside the user's data, and steps and lines that go with their recipe.

const recipeTables = ["recipe", "recipe_step", "recipe_ingredient"] as const;

async function addIngredient(db: Db, name: string): Promise<string> {
  const { data, error } = await db
    .from("ingredient")
    .insert({ name, normalized_name: name.toLowerCase(), section: "Frukt och grönt", location: "Skafferi" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function addRecipe(db: Db, title = "Linssoppa"): Promise<string> {
  const { data, error } = await db
    .from("recipe")
    .insert({ title, original_servings: 4, source_kind: "text" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function addStep(db: Db, recipeId: string, position = 0): Promise<string> {
  const { data, error } = await db
    .from("recipe_step")
    .insert({ recipe_id: recipeId, position, text: `Steg ${position + 1}` })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** The save_recipe arguments for a small recipe with a new id; `lines` replaces the default lines. */
function saveArgs(lines?: SaveRecipeArgs["lines"]): SaveRecipeArgs {
  return {
    recipe: {
      id: randomUUID(),
      title: "Linssoppa",
      original_servings: 4,
      total_minutes: 30,
      image_url: null,
      source_kind: "text",
      source_url: null,
    },
    steps: [
      { position: 0, text: "Hacka löken." },
      { position: 1, text: "Koka allt." },
    ],
    lines: lines ?? [
      { position: 0, original_text: "3 dl röda linser", amount: 3, unit: "dl", is_vague: false, ingredient_id: null, step_position: 1 },
      { position: 1, original_text: "salt", amount: null, unit: null, is_vague: true, ingredient_id: null, step_position: null },
    ],
  };
}

async function countAll(user: TestUser): Promise<number[]> {
  return Promise.all(recipeTables.map((table) => countRows(table, user.id)));
}

const line = (overrides: Partial<RecipeLine> & Pick<RecipeLine, "originalText" | "ingredient">): RecipeLine => ({
  amount: null,
  unit: null,
  isVague: true,
  stepIndexes: [],
  ...overrides,
});

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("schema and RLS", () => {
  it("isolates recipe", async () => {
    await expectRlsIsolation("recipe", async () => ({
      title: "Krämig kycklinggryta",
      original_servings: 4,
      total_minutes: 35,
      source_kind: "url",
      source_url: "https://www.koket.se/kramig-kycklinggryta",
    }));
  });

  it("isolates recipe_step", async () => {
    await expectRlsIsolation("recipe_step", async (owner) => ({
      recipe_id: await addRecipe(owner),
      position: 0,
      text: "Hacka löken.",
    }));
  });

  it("isolates recipe_ingredient", async () => {
    await expectRlsIsolation("recipe_ingredient", async (owner) => ({
      recipe_id: await addRecipe(owner),
      ingredient_id: await addIngredient(owner, "Gul lök"),
      position: 0,
      original_text: "1 gul lök",
      amount: 1,
      unit: "st",
      is_vague: false,
    }));
  });

  it("lets only signed-in users run save_recipe", async () => {
    expect((await anonClient().rpc("save_recipe", saveArgs())).error?.code).toBe("42501");
    // auth.uid() is null for the service role, so it may not run it either.
    expect((await adminClient().rpc("save_recipe", saveArgs())).error?.code).toBe("42501");
  });

  it("rejects values outside the rules", async () => {
    const user = await createTestUser("recipe-checks");
    const base = { title: "x", original_servings: 1, source_kind: "text" };
    for (const bad of [
      { title: " " },
      { original_servings: 0 },
      { total_minutes: -1 },
      { source_kind: "bok" },
      { source_kind: "text", source_url: "https://www.koket.se/x" },
      { source_kind: "url", source_url: "javascript:alert(1)" },
      // A link always has its address.
      { source_kind: "url" },
      { image_url: "data:image/png;base64,AAAA" },
      { title: "a".repeat(201) },
      { source_kind: "url", source_url: `https://koket.se/${"a".repeat(2048)}` },
      { image_url: `https://koket.se/${"a".repeat(2048)}` },
    ]) {
      const { error } = await user.db.from("recipe").insert({ ...base, ...bad });
      expect(error?.code, JSON.stringify(bad)).toBe("23514");
    }

    const recipeId = await addRecipe(user.db);
    const lineBase = { recipe_id: recipeId, original_text: "x", amount: 1, unit: "st", is_vague: false };
    for (const [index, bad] of [
      // A vague line has neither amount nor unit, and a line without amount is vague.
      { is_vague: true },
      { is_vague: true, amount: null, unit: "st" },
      { amount: null, unit: null },
      { unit: "deciliter" },
      { amount: 0 },
      { original_text: " " },
      { original_text: "a".repeat(301) },
    ].entries()) {
      const { error } = await user.db.from("recipe_ingredient").insert({ ...lineBase, position: index, ...bad });
      expect(error?.code, JSON.stringify(bad)).toBe("23514");
    }
    for (const text of ["  ", "a".repeat(2001)]) {
      const { error } = await user.db.from("recipe_step").insert({ recipe_id: recipeId, position: 0, text });
      expect(error?.code, `step of ${text.length} characters`).toBe("23514");
    }
    // At the limits.
    const atLimit = await user.db.from("recipe").insert({ ...base, title: "a".repeat(200) });
    expect(atLimit.error).toBeNull();
  });

  it("does not let a recipe point at another user's ingredient, recipe or step", async () => {
    const owner = await createTestUser("ref-owner");
    const other = await createTestUser("ref-other");
    const othersIngredient = await addIngredient(other.db, "Rödlök");
    const othersRecipe = await addRecipe(other.db);

    const recipeId = await addRecipe(owner.db);
    const foreignIngredient = await owner.db.from("recipe_ingredient").insert({
      recipe_id: recipeId,
      ingredient_id: othersIngredient,
      position: 0,
      original_text: "1 rödlök",
      amount: 1,
      unit: "st",
      is_vague: false,
    });
    expect(foreignIngredient.error?.code).toBe("23503");
    const foreignRecipe = await owner.db.from("recipe_step").insert({ recipe_id: othersRecipe, position: 0, text: "x" });
    expect(foreignRecipe.error?.code).toBe("23503");

    // A step of another recipe, even the user's own, is not a step of this one.
    const otherRecipe = await addRecipe(owner.db, "Annat recept");
    const otherStep = await addStep(owner.db, otherRecipe);
    const foreignStep = await owner.db.from("recipe_ingredient").insert({
      recipe_id: recipeId,
      step_id: otherStep,
      position: 0,
      original_text: "salt",
      is_vague: true,
    });
    expect(foreignStep.error?.code).toBe("23503");
  });

  it("removes steps and lines with their recipe, and keeps the catalog", async () => {
    const user = await createTestUser("recipe-delete");
    const ingredientId = await addIngredient(user.db, "Linser");
    const lines = saveArgs().lines.map((row) => ({ ...row, ingredient_id: ingredientId }));
    const { data: id, error } = await user.db.rpc("save_recipe", saveArgs(lines));
    expect(error).toBeNull();
    expect(await countAll(user)).toEqual([1, 2, 2]);

    const removed = await user.db.from("recipe").delete().eq("id", id!).select("id");
    expect(removed.data).toHaveLength(1);
    expect(await countAll(user)).toEqual([0, 0, 0]);
    expect(await countRows("ingredient", user.id)).toBe(1);
  });

  it("keeps a line without its step when the step is removed", async () => {
    const user = await createTestUser("step-delete");
    const { data: id } = await user.db.rpc("save_recipe", saveArgs());
    await user.db.from("recipe_step").delete().eq("recipe_id", id!).eq("position", 1);
    const { data } = await user.db.from("recipe_ingredient").select("step_id").eq("recipe_id", id!);
    expect(data).toEqual([{ step_id: null }, { step_id: null }]);
  });
});

describe("save_recipe", () => {
  it("saves the recipe, its steps and lines, with the step link", async () => {
    const user = await createTestUser("save");
    const { data: id, error } = await user.db.rpc("save_recipe", saveArgs());
    expect(error).toBeNull();

    const recipe = await user.db.from("recipe").select("*").eq("id", id!).single();
    expect(recipe.data).toMatchObject({ title: "Linssoppa", original_servings: 4, total_minutes: 30, is_favorite: false });
    const steps = await user.db.from("recipe_step").select("id, position, text").eq("recipe_id", id!).order("position");
    expect(steps.data?.map(({ text }) => text)).toEqual(["Hacka löken.", "Koka allt."]);
    const lines = await user.db
      .from("recipe_ingredient")
      .select("position, original_text, amount, unit, is_vague, ingredient_id, step_id")
      .eq("recipe_id", id!)
      .order("position");
    expect(lines.data).toEqual([
      { position: 0, original_text: "3 dl röda linser", amount: 3, unit: "dl", is_vague: false, ingredient_id: null, step_id: steps.data![1].id },
      { position: 1, original_text: "salt", amount: null, unit: null, is_vague: true, ingredient_id: null, step_id: null },
    ]);
  });

  it("saves everything or nothing: an invalid line in the middle leaves no rows", async () => {
    const user = await createTestUser("save-nothing");
    const [first, second] = saveArgs().lines;
    const vagueWithAmount = { ...second, position: 1, amount: 2 };
    const { error } = await user.db.rpc("save_recipe", saveArgs([first, vagueWithAmount, { ...second, position: 2 }]));
    expect(error?.code).toBe("23514");
    expect(await countAll(user)).toEqual([0, 0, 0]);
  });

  it("refuses another user's ingredient and saves nothing", async () => {
    const user = await createTestUser("save-foreign");
    const other = await createTestUser("save-foreign-other");
    const othersIngredient = await addIngredient(other.db, "Rödlök");
    const lines = saveArgs().lines.map((row) => ({ ...row, ingredient_id: othersIngredient }));
    const { error } = await user.db.rpc("save_recipe", saveArgs(lines));
    expect(error?.code).toBe("23503");
    expect(await countAll(user)).toEqual([0, 0, 0]);
  });

  it("saves a preview once, however often it is saved with the same id", async () => {
    const user = await createTestUser("save-twice");
    const args = saveArgs();
    const first = await user.db.rpc("save_recipe", args);
    expect(first.error).toBeNull();
    expect(first.data).toBe(args.recipe.id);
    const second = await user.db.rpc("save_recipe", { ...args, recipe: { ...args.recipe, title: "Annan titel" } });
    expect(second.error).toBeNull();
    expect(second.data).toBe(args.recipe.id);
    expect(await countAll(user)).toEqual([1, 2, 2]);
    const { data } = await user.db.from("recipe").select("title").eq("id", args.recipe.id).single();
    expect(data?.title).toBe("Linssoppa");
  });

  it("refuses an id another user has and writes nothing", async () => {
    const owner = await createTestUser("id-owner");
    const other = await createTestUser("id-other");
    const args = saveArgs();
    expect((await owner.db.rpc("save_recipe", args)).error).toBeNull();
    const { error } = await other.db.rpc("save_recipe", args);
    expect(error?.code).toBe("23505");
    expect(await countAll(other)).toEqual([0, 0, 0]);
    expect(await countAll(owner)).toEqual([1, 2, 2]);
  });

  it.each([
    ["a recipe that is not an object", (args: SaveRecipeArgs) => ({ ...args, recipe: [args.recipe] as never })],
    ["a recipe without id", (args: SaveRecipeArgs) => ({ ...args, recipe: { ...args.recipe, id: undefined as never } })],
    ["steps that do not start at 0", (args: SaveRecipeArgs) => ({ ...args, steps: args.steps.map((step) => ({ ...step, position: step.position + 1 })) })],
    ["a gap in the steps", (args: SaveRecipeArgs) => ({ ...args, steps: [args.steps[0], { ...args.steps[1], position: 2 }] })],
    ["a step position twice", (args: SaveRecipeArgs) => ({ ...args, steps: [args.steps[0], { ...args.steps[1], position: 0 }] })],
    [
      "more than 100 steps",
      (args: SaveRecipeArgs) => ({ ...args, steps: Array.from({ length: 101 }, (_, position) => ({ position, text: "Koka." })) }),
    ],
    [
      "more than 200 lines",
      (args: SaveRecipeArgs) => ({
        ...args,
        lines: Array.from({ length: 201 }, (_, position) => ({ ...args.lines[1], position })),
      }),
    ],
  ])("refuses %s (22023) and saves nothing", async (name, change) => {
    const user = await createTestUser(`save-shape-${name.replace(/\W+/g, "-")}`);
    const { error } = await user.db.rpc("save_recipe", change(saveArgs()));
    expect(error?.code).toBe("22023");
    expect(await countAll(user)).toEqual([0, 0, 0]);
  });

  it("saves 100 steps and 200 lines", async () => {
    const user = await createTestUser("save-max");
    const args = saveArgs();
    const { error } = await user.db.rpc("save_recipe", {
      ...args,
      steps: Array.from({ length: 100 }, (_, position) => ({ position, text: "Koka." })),
      lines: Array.from({ length: 200 }, (_, position) => ({ ...args.lines[1], position })),
    });
    expect(error).toBeNull();
    expect(await countAll(user)).toEqual([1, 100, 200]);
  });

  it("sets updated_at when a recipe changes", async () => {
    const user = await createTestUser("updated-at");
    const id = await addRecipe(user.db);
    const before = await user.db.from("recipe").select("updated_at").eq("id", id).single();
    // Even when the update tries to set it, the trigger wins.
    const updated = await user.db
      .from("recipe")
      .update({ is_favorite: true, updated_at: "2000-01-01T00:00:00Z" })
      .eq("id", id)
      .select("updated_at")
      .single();
    expect(updated.error).toBeNull();
    expect(new Date(updated.data!.updated_at).getTime()).toBeGreaterThan(new Date(before.data!.updated_at).getTime());
  });

  it("refuses a step position that names no step and saves nothing", async () => {
    const user = await createTestUser("save-step");
    const lines = saveArgs().lines.map((row) => ({ ...row, step_position: 5 }));
    const { error } = await user.db.rpc("save_recipe", saveArgs(lines));
    expect(error?.code).toBe("22023");
    expect(await countAll(user)).toEqual([0, 0, 0]);
  });
});

describe("saveRecipeIn and getRecipe", () => {
  it("saves a reviewed draft after the catalog commit and reads it back", async () => {
    const user = await createTestUser("save-draft");
    const gulLok = await addIngredient(user.db, "Gul lök");
    const rodlok = await addIngredient(user.db, "Rödlök");
    const draft: RecipeDraft = {
      title: "Linssoppa",
      servings: 4,
      totalMinutes: null,
      imageUrl: "https://www.koket.se/bild.jpg",
      sourceKind: "url",
      sourceUrl: "https://www.koket.se/linssoppa",
      steps: ["Hacka löken.", "Koka allt."],
      lines: [
        // Pontus swapped the suggested Gul lök for Rödlök.
        line({
          originalText: "Lök, hackad",
          amount: 1,
          unit: "st",
          isVague: false,
          ingredient: { kind: "chosen", ingredientId: rodlok },
          stepIndexes: [1, 0],
        }),
        line({
          originalText: "2 morötter",
          amount: 2,
          unit: "st",
          isVague: false,
          ingredient: {
            kind: "new",
            proposal: { name: "Morot", section: "Frukt och grönt", location: "Kyl", defaultUnit: "st" },
          },
        }),
        line({ originalText: "salt efter smak", ingredient: { kind: "match", ingredientId: gulLok, confidence: "exact" } }),
        line({ originalText: "något gott", ingredient: { kind: "unmatched" } }),
      ],
    };

    const ids = await commitIngredients(
      user.db,
      draft.lines.map(({ originalText, ingredient }) => ({ text: originalText, ingredient })),
    );
    const recipeId = randomUUID();
    const id = await saveRecipeIn(user.db, recipeId, draft, ids);
    expect(id).toBe(recipeId);
    const names = (ingredientIds: readonly string[]) => loadIngredientNames(user.db, ingredientIds);
    const saved = await getRecipe(user.db, id, names);

    expect(saved).toMatchObject({
      id,
      title: "Linssoppa",
      servings: 4,
      totalMinutes: null,
      imageUrl: "https://www.koket.se/bild.jpg",
      sourceKind: "url",
      sourceUrl: "https://www.koket.se/linssoppa",
      isFavorite: false,
    });
    expect(saved!.steps.map(({ position, text }) => ({ position, text }))).toEqual([
      { position: 0, text: "Hacka löken." },
      { position: 1, text: "Koka allt." },
    ]);
    expect(saved!.lines).toMatchObject([
      {
        position: 0,
        originalText: "Lök, hackad",
        amount: 1,
        unit: "st",
        isVague: false,
        ingredientId: rodlok,
        ingredientName: "Rödlök",
        stepId: saved!.steps[0].id,
      },
      {
        position: 1,
        originalText: "2 morötter",
        amount: 2,
        unit: "st",
        isVague: false,
        ingredientId: ids[1],
        ingredientName: "Morot",
        stepId: null,
      },
      {
        position: 2,
        originalText: "salt efter smak",
        amount: null,
        unit: null,
        isVague: true,
        ingredientId: gulLok,
        ingredientName: "Gul lök",
        stepId: null,
      },
      {
        position: 3,
        originalText: "något gott",
        amount: null,
        unit: null,
        isVague: true,
        ingredientId: null,
        ingredientName: null,
        stepId: null,
      },
    ]);

    // The catalog saved the correction as a synonym for Rödlök.
    const synonym = await user.db.from("ingredient_synonym").select("ingredient_id").eq("normalized", "lök").single();
    expect(synonym.data?.ingredient_id).toBe(rodlok);

    // Another user sees nothing.
    const other = await createTestUser("save-draft-other");
    expect(await getRecipe(other.db, id, names)).toBeNull();
  });
});

describe("the library: listRecipes, searchRecipesIn and setFavoriteIn", () => {
  let user: TestUser;
  let other: TestUser;
  const ids: Record<"gryta" | "soppa" | "pannkakor" | "procent", string> = {
    gryta: "",
    soppa: "",
    pannkakor: "",
    procent: "",
  };
  let gulLok = "";
  let agg = "";

  async function addLibraryRecipe(
    db: Db,
    recipe: { title: string; minutes?: number; favorite?: boolean },
    lines: { text: string; ingredientId?: string }[],
  ): Promise<string> {
    const { data, error } = await db
      .from("recipe")
      .insert({
        title: recipe.title,
        original_servings: 4,
        total_minutes: recipe.minutes ?? null,
        source_kind: "text",
        is_favorite: recipe.favorite ?? false,
      })
      .select("id")
      .single();
    if (error) throw error;
    for (const [position, line] of lines.entries()) {
      const inserted = await db.from("recipe_ingredient").insert({
        recipe_id: data.id,
        ingredient_id: line.ingredientId ?? null,
        position,
        original_text: line.text,
        is_vague: true,
      });
      if (inserted.error) throw inserted.error;
    }
    return data.id;
  }

  const search = (db: Db, text: string, favoritesOnly = false) =>
    findIngredientIdsIn(db, text).then((ingredientIds) => searchRecipesIn(db, { text, ingredientIds, favoritesOnly }));
  const idsOf = (items: RecipeListItem[]) => items.map(({ id }) => id);

  beforeAll(async () => {
    user = await createTestUser("library");
    other = await createTestUser("library-other");
    gulLok = await addIngredient(user.db, "Gul lök");
    agg = await addIngredient(user.db, "Ägg");
    const { error } = await user.db.from("ingredient_synonym").insert({ normalized: "hönsägg", ingredient_id: agg });
    if (error) throw error;

    // Saved in this order, so newest first is procent, pannkakor, soppa, gryta.
    ids.gryta = await addLibraryRecipe(user.db, { title: "Krämig kycklinggryta", minutes: 35, favorite: true }, [
      { text: "1 st gul lök", ingredientId: gulLok },
      { text: "600 g kycklinglårfilé" },
    ]);
    ids.soppa = await addLibraryRecipe(user.db, { title: "Linssoppa" }, [{ text: "1 lök, hackad" }, { text: "salt" }]);
    ids.pannkakor = await addLibraryRecipe(user.db, { title: "Pannkakor" }, [{ text: "3 ägg", ingredientId: agg }]);
    ids.procent = await addLibraryRecipe(user.db, { title: "Grädde 50% med extra_sås" }, [{ text: "2 dl grädde" }]);

    // Another user's recipe that matches the same words.
    const othersOnion = await addIngredient(other.db, "Gul lök");
    await addLibraryRecipe(other.db, { title: "Annan gryta", favorite: true }, [{ text: "1 lök", ingredientId: othersOnion }]);
  });

  it("lists the user's recipes as rows, newest first, and only favourites on request", async () => {
    const all = await listRecipes(user.db);
    expect(idsOf(all)).toEqual([ids.procent, ids.pannkakor, ids.soppa, ids.gryta]);
    expect(all.at(-1)).toEqual({
      id: ids.gryta,
      title: "Krämig kycklinggryta",
      imageUrl: null,
      totalMinutes: 35,
      originalServings: 4,
      isFavorite: true,
    });
    expect(idsOf(await listRecipes(user.db, { favoritesOnly: true }))).toEqual([ids.gryta]);
  });

  it("finds recipes by title", async () => {
    expect(idsOf(await search(user.db, "gryta"))).toEqual([ids.gryta]);
    expect(idsOf(await search(user.db, "LINS"))).toEqual([ids.soppa]);
  });

  it("finds recipes by a line's original text and its catalog ingredient, each recipe once, newest first", async () => {
    expect(idsOf(await search(user.db, "lök"))).toEqual([ids.soppa, ids.gryta]);
  });

  it("finds recipes through a synonym of the line's ingredient", async () => {
    expect(idsOf(await search(user.db, "hönsägg"))).toEqual([ids.pannkakor]);
  });

  it("combines search and Favoriter", async () => {
    expect(idsOf(await search(user.db, "lök", true))).toEqual([ids.gryta]);
    expect(await search(user.db, "linssoppa", true)).toEqual([]);
  });

  it("treats LIKE wildcards in the text as plain characters", async () => {
    expect(idsOf(await search(user.db, "%"))).toEqual([ids.procent]);
    expect(idsOf(await search(user.db, "_"))).toEqual([ids.procent]);
    expect(idsOf(await search(user.db, "50%"))).toEqual([ids.procent]);
    expect(await search(user.db, "\\")).toEqual([]);
    expect(await search(user.db, "xyz")).toEqual([]);
    expect(await searchRecipesIn(user.db, { text: "", ingredientIds: [gulLok] })).toEqual([]);
  });

  it("finds a recipe through an ingredient id beyond the first chunk of 100", async () => {
    const many = [...Array.from({ length: 149 }, () => randomUUID()), agg];
    expect(idsOf(await searchRecipesIn(user.db, { text: "qqq", ingredientIds: many }))).toEqual([ids.pannkakor]);
  });

  it("respects RLS: another user and the anonymous client see none of the recipes", async () => {
    expect(idsOf(await listRecipes(other.db))).not.toContain(ids.gryta);
    expect(await listRecipes(other.db)).toHaveLength(1);
    // Even with the owner's ingredient ids.
    const found = await searchRecipesIn(other.db, { text: "kyckling", ingredientIds: [gulLok, agg], favoritesOnly: false });
    expect(found).toEqual([]);
    await expect(listRecipes(anonClient())).rejects.toThrow("query_failed 42501");
  });

  it("sets a favourite on the user's own recipe only", async () => {
    expect(await setFavoriteIn(user.db, user.id, ids.soppa, true)).toBe(true);
    expect(idsOf(await listRecipes(user.db, { favoritesOnly: true }))).toEqual([ids.soppa, ids.gryta]);
    expect(await setFavoriteIn(user.db, user.id, ids.soppa, false)).toBe(true);
    expect(idsOf(await listRecipes(user.db, { favoritesOnly: true }))).toEqual([ids.gryta]);

    // Another user's id changes nothing.
    expect(await setFavoriteIn(other.db, other.id, ids.pannkakor, true)).toBe(false);
    // The update filters on the user too: the owner's recipe under another user id changes nothing.
    expect(await setFavoriteIn(user.db, other.id, ids.pannkakor, true)).toBe(false);
    const { data } = await adminClient().from("recipe").select("is_favorite").eq("id", ids.pannkakor).single();
    expect(data?.is_favorite).toBe(false);
  });

  it("lists 200 recipes well within a second (NFR7)", async () => {
    const many = await createTestUser("library-200");
    const rows = Array.from({ length: 200 }, (_, index) => ({
      title: `Recept ${index}`,
      original_servings: 4,
      total_minutes: 30,
      source_kind: "text",
      is_favorite: index % 5 === 0,
    }));
    const { error } = await many.db.from("recipe").insert(rows);
    if (error) throw error;
    const started = performance.now();
    const listed = await listRecipes(many.db);
    const listMs = performance.now() - started;
    const searchStarted = performance.now();
    const found = await search(many.db, "recept 1");
    const searchMs = performance.now() - searchStarted;
    console.info(`listRecipes, 200 recipes: ${listMs.toFixed(0)} ms; searchRecipesIn: ${searchMs.toFixed(0)} ms`);
    expect(listed).toHaveLength(200);
    expect(found.length).toBeGreaterThan(100);
    expect(listMs).toBeLessThan(1000);
    expect(searchMs).toBeLessThan(1000);
  });
});

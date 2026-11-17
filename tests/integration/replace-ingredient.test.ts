import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRecipe } from "@/features/recipes/data/queries";
import { replaceRecipeLineIn } from "@/features/recipes/data/line";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// Byt ut ingrediens (supabase/migrations/20261117150000_replace_ingredient.sql) against local Supabase:
// replace_recipe_line swaps a line's ingredient and text and keeps its amount and unit, remembers the original
// once, puts it back, checks the recipe's updated_at, and only takes an ingredient of the caller's household.

let a: TestUser;
let b: TestUser;

async function addIngredient(db: Db, name: string): Promise<string> {
  const { data, error } = await db
    .from("ingredient")
    .insert({ name, normalized_name: `${name.toLowerCase()} ${randomUUID().slice(0, 8)}`, section: "Frukt och grönt", location: "Kyl" } as never)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function addRecipe(db: Db, ingredientId: string): Promise<{ id: string; lineIds: string[] }> {
  const id = randomUUID();
  const { error } = await db.rpc("save_recipe", {
    recipe: { id, title: "Thaicurry", original_servings: 4, total_minutes: 30, image_url: null, source_kind: "text", source_url: null },
    steps: [{ position: 0, text: "Hacka koriandern." }],
    lines: [{ position: 0, original_text: "1 knippe koriander", amount: 1, unit: "st", is_vague: false, ingredient_id: ingredientId, step_position: 0 }],
  } as never);
  if (error) throw error;
  const lines = await adminClient().from("recipe_ingredient").select("id").eq("recipe_id", id).order("position");
  return { id, lineIds: (lines.data ?? []).map((line) => line.id) };
}

const stateOf = async (db: Db, id: string) => {
  const recipe = await getRecipe(db, id, async () => ({}));
  return { updatedAt: recipe!.updatedAt, line: recipe!.lines[0] };
};

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("byt-a");
  b = await createTestUser("byt-b");
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("replace_recipe_line", () => {
  it("replaces the ingredient and text, keeps amount and unit, and remembers the first original", async () => {
    const koriander = await addIngredient(a.db, "Koriander");
    const persilja = await addIngredient(a.db, "Persilja");
    const dill = await addIngredient(a.db, "Dill");
    const { id, lineIds } = await addRecipe(a.db, koriander);
    const before = await stateOf(a.db, id);

    const first = await replaceRecipeLineIn(a.db, id, lineIds[0], before.updatedAt, { ingredientId: persilja, text: "Persilja" });
    expect(first).toMatchObject({ updatedAt: expect.any(String) });
    const after = await stateOf(a.db, id);
    expect(after.line).toMatchObject({ originalText: "Persilja", ingredientId: persilja, amount: 1, unit: "st", replacedFrom: "1 knippe koriander", isStruck: false });
    expect(after.updatedAt).not.toBe(before.updatedAt);

    // A second replacement keeps the first original.
    await replaceRecipeLineIn(a.db, id, lineIds[0], after.updatedAt, { ingredientId: dill, text: "Dill" });
    const twice = await stateOf(a.db, id);
    expect(twice.line).toMatchObject({ originalText: "Dill", ingredientId: dill, replacedFrom: "1 knippe koriander" });

    // Ta tillbaka puts the first one back.
    await replaceRecipeLineIn(a.db, id, lineIds[0], twice.updatedAt, null);
    expect((await stateOf(a.db, id)).line).toMatchObject({ originalText: "1 knippe koriander", ingredientId: koriander, replacedFrom: null, amount: 1 });
  });

  it("gives conflict for an old updated_at and changes nothing", async () => {
    const koriander = await addIngredient(a.db, "Koriander");
    const persilja = await addIngredient(a.db, "Persilja");
    const { id, lineIds } = await addRecipe(a.db, koriander);
    expect(await replaceRecipeLineIn(a.db, id, lineIds[0], "2020-01-01T00:00:00+00:00", { ingredientId: persilja, text: "Persilja" })).toBe("conflict");
    expect((await stateOf(a.db, id)).line.originalText).toBe("1 knippe koriander");
  });

  it("says not_found for another household's ingredient and recipe, and changes nothing", async () => {
    const koriander = await addIngredient(a.db, "Koriander");
    const theirs = await addIngredient(b.db, "Basilika");
    const mine = await addRecipe(a.db, koriander);
    const other = await addRecipe(b.db, theirs);
    const state = await stateOf(a.db, mine.id);
    expect(await replaceRecipeLineIn(a.db, mine.id, mine.lineIds[0], state.updatedAt, { ingredientId: theirs, text: "Basilika" })).toBe("not_found");
    const otherState = await stateOf(b.db, other.id);
    expect(await replaceRecipeLineIn(a.db, other.id, other.lineIds[0], otherState.updatedAt, { ingredientId: koriander, text: "Koriander" })).toBe("not_found");
    expect((await stateOf(a.db, mine.id)).line.originalText).toBe("1 knippe koriander");
    expect((await stateOf(b.db, other.id)).line.originalText).toBe("1 knippe koriander");
  });

  it("refuses a replacement without a name", async () => {
    const koriander = await addIngredient(a.db, "Koriander");
    const { id, lineIds } = await addRecipe(a.db, koriander);
    const state = await stateOf(a.db, id);
    await expect(replaceRecipeLineIn(a.db, id, lineIds[0], state.updatedAt, { ingredientId: koriander, text: "  " })).rejects.toThrow();
  });
});

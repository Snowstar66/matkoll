import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRecipe, getRecipesByIdsIn } from "@/features/recipes/data/queries";
import { setRecipeLineIn } from "@/features/recipes/data/line";
import { getSharedIn, saveSharedIn, setSharedIn } from "@/features/recipes/data/shared";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// Stryk ingrediens (supabase/migrations/20261117100000_strike_ingredient.sql) against local Supabase:
// set_recipe_line strikes or restores one line or changes its amount against the recipe's updated_at, a struck
// line stays out of the library's status lines, editing keeps it struck, and a saved copy of a shared recipe has it.

let a: TestUser;
let b: TestUser;

async function addRecipe(db: Db): Promise<{ id: string; lineIds: string[] }> {
  const id = randomUUID();
  const { error } = await db.rpc("save_recipe", {
    recipe: { id, title: "Thaicurry", original_servings: 4, total_minutes: 30, image_url: null, source_kind: "text", source_url: null },
    steps: [{ position: 0, text: "Hacka koriandern." }],
    lines: [
      { position: 0, original_text: "4 dl kokosmjölk", amount: 4, unit: "dl", is_vague: false, ingredient_id: null, step_position: 0 },
      { position: 1, original_text: "1 knippe koriander", amount: 1, unit: "st", is_vague: false, ingredient_id: null, step_position: 0 },
      { position: 2, original_text: "salt", amount: null, unit: null, is_vague: true, ingredient_id: null, step_position: null },
    ],
  } as never);
  if (error) throw error;
  const lines = await adminClient().from("recipe_ingredient").select("id").eq("recipe_id", id).order("position");
  return { id, lineIds: (lines.data ?? []).map((line) => line.id) };
}

const stateOf = async (db: Db, id: string) => {
  const recipe = await getRecipe(db, id, async () => ({}));
  return { updatedAt: recipe!.updatedAt, lines: recipe!.lines };
};

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("stryk-a");
  b = await createTestUser("stryk-b");
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("set_recipe_line", () => {
  it("strikes and restores a line, bumping updated_at, and the new updated_at is the next lock", async () => {
    const { id, lineIds } = await addRecipe(a.db);
    const before = await stateOf(a.db, id);
    expect(before.lines.map((line) => line.isStruck)).toEqual([false, false, false]);

    const struck = await setRecipeLineIn(a.db, id, lineIds[1], before.updatedAt, { isStruck: true });
    expect(struck).toMatchObject({ updatedAt: expect.any(String) });
    const after = await stateOf(a.db, id);
    expect(after.lines.map((line) => line.isStruck)).toEqual([false, true, false]);
    expect(after.updatedAt).not.toBe(before.updatedAt);
    expect(struck).toEqual({ updatedAt: after.updatedAt });

    expect(await setRecipeLineIn(a.db, id, lineIds[1], after.updatedAt, { isStruck: false })).toMatchObject({ updatedAt: expect.any(String) });
    expect((await stateOf(a.db, id)).lines.map((line) => line.isStruck)).toEqual([false, false, false]);
  });

  it("gives conflict for an old updated_at and changes nothing", async () => {
    const { id, lineIds } = await addRecipe(a.db);
    const before = await stateOf(a.db, id);
    expect(await setRecipeLineIn(a.db, id, lineIds[0], "2020-01-01T00:00:00+00:00", { isStruck: true })).toBe("conflict");
    expect((await stateOf(a.db, id)).lines[0].isStruck).toBe(false);
    expect((await stateOf(a.db, id)).updatedAt).toBe(before.updatedAt);
  });

  it("changes the amount of a line with an amount, and leaves a vague line without one", async () => {
    const { id, lineIds } = await addRecipe(a.db);
    let state = await stateOf(a.db, id);
    await setRecipeLineIn(a.db, id, lineIds[0], state.updatedAt, { amount: 2.5 });
    state = await stateOf(a.db, id);
    expect(state.lines[0]).toMatchObject({ amount: 2.5, unit: "dl", isVague: false });
    await setRecipeLineIn(a.db, id, lineIds[2], state.updatedAt, { amount: 3 });
    state = await stateOf(a.db, id);
    expect(state.lines[2]).toMatchObject({ amount: null, isVague: true });
  });

  it("says not_found for a line that is not in the recipe, and for another household's recipe", async () => {
    const mine = await addRecipe(a.db);
    const other = await addRecipe(b.db);
    const state = await stateOf(a.db, mine.id);
    expect(await setRecipeLineIn(a.db, mine.id, other.lineIds[0], state.updatedAt, { isStruck: true })).toBe("not_found");
    const theirs = await stateOf(b.db, other.id);
    expect(await setRecipeLineIn(a.db, other.id, other.lineIds[0], theirs.updatedAt, { isStruck: true })).toBe("not_found");
    expect((await stateOf(b.db, other.id)).lines[0].isStruck).toBe(false);
  });

  it("refuses nothing to change and an amount that is not above zero", async () => {
    const { id, lineIds } = await addRecipe(a.db);
    const state = await stateOf(a.db, id);
    await expect(setRecipeLineIn(a.db, id, lineIds[0], state.updatedAt, {})).rejects.toThrow();
    await expect(setRecipeLineIn(a.db, id, lineIds[0], state.updatedAt, { amount: 0 })).rejects.toThrow();
  });

  it("can be run by a signed-in user only", async () => {
    const { id, lineIds } = await addRecipe(a.db);
    const anon = await import("./support").then((support) => support.anonClient());
    const { error } = await anon.rpc("set_recipe_line", {
      target_recipe: id,
      target_line: lineIds[0],
      expected_updated_at: "2026-11-17T10:00:00+00:00",
      new_is_struck: true,
      new_amount: null as never,
    });
    expect(error).not.toBeNull();
  });
});

describe("a struck line", () => {
  it("is left out of the recipes read for the status and the shopping list", async () => {
    const { id, lineIds } = await addRecipe(a.db);
    const state = await stateOf(a.db, id);
    await setRecipeLineIn(a.db, id, lineIds[1], state.updatedAt, { isStruck: true });
    const rows = await getRecipesByIdsIn(a.db, [id]);
    expect(rows[0].lines.map((line) => line.originalText)).toEqual(["4 dl kokosmjölk", "salt"]);
  });

  it("stays struck when the recipe is edited with update_recipe", async () => {
    const { id, lineIds } = await addRecipe(a.db);
    let state = await stateOf(a.db, id);
    await setRecipeLineIn(a.db, id, lineIds[1], state.updatedAt, { isStruck: true });
    state = await stateOf(a.db, id);
    const saved = await a.db.from("recipe_step").select("id").eq("recipe_id", id);
    const { error } = await a.db.rpc("update_recipe", {
      id,
      expected_updated_at: state.updatedAt,
      recipe: { title: "Thaicurry med lime", original_servings: 4, total_minutes: 30 },
      steps: [{ id: saved.data![0].id, position: 0, text: "Hacka koriandern." }],
      lines: state.lines.map((line, position) => ({
        id: line.id,
        position,
        original_text: line.originalText,
        amount: line.amount,
        unit: line.unit,
        is_vague: line.isVague,
        ingredient_id: null,
        step_position: null,
      })),
    } as never);
    expect(error).toBeNull();
    expect((await stateOf(a.db, id)).lines.map((line) => line.isStruck)).toEqual([false, true, false]);
  });

  it("follows along into the copy another household saves of a shared recipe", async () => {
    const { id, lineIds } = await addRecipe(a.db);
    const state = await stateOf(a.db, id);
    await setRecipeLineIn(a.db, id, lineIds[1], state.updatedAt, { isStruck: true });
    expect(await setSharedIn(a.db, id, true)).toBe(true);
    const shared = await getSharedIn(b.db, id);
    expect(shared).not.toBeNull();
    const saved = await saveSharedIn(b.db, id, shared!.lines.map(() => null), shared!.version);
    expect(typeof saved).toBe("object");
    const copy = await stateOf(b.db, (saved as { id: string }).id);
    expect(copy.lines.map((line) => [line.originalText, line.isStruck])).toEqual([
      ["4 dl kokosmjölk", false],
      ["1 knippe koriander", true],
      ["salt", false],
    ]);
  });
});

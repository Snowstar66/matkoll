import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// The repair of saved garlic lines (supabase/migrations/20261108230000_garlic_cloves.sql): "2
// vitlöksklyftor" saved as 2 whole bulbs becomes 2 klyfta, other lines stay as they are, recipe.updated_at
// (Ändra recept's lock) is not touched, and running it again changes nothing.

const migration = "supabase/migrations/20261108230000_garlic_cloves.sql";

/** Runs the migration file against local Postgres as the superuser, as `supabase db reset` would. */
function runRepair(): void {
  const out = execFileSync("node_modules/.bin/supabase", ["db", "query", "--local", "-f", migration], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  expect(out).toMatch(/UPDATE \d+/);
}

let user: TestUser;

async function addIngredient(db: Db, name: string): Promise<string> {
  const { data, error } = await db
    .from("ingredient")
    .insert({ name, normalized_name: name, section: "Frukt och grönt", location: "Skafferi" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

type Line = { text: string; amount: number | null; unit: string | null; ingredientId?: string };

async function addRecipe(db: Db, lines: Line[]): Promise<{ recipeId: string; updatedAt: string }> {
  const recipe = await db
    .from("recipe")
    .insert({ title: "Fläskfilé provençale", original_servings: 4, source_kind: "text" })
    .select("id, updated_at")
    .single();
  if (recipe.error) throw recipe.error;
  const added = await db.from("recipe_ingredient").insert(
    lines.map((line, position) => ({
      recipe_id: recipe.data.id,
      ingredient_id: line.ingredientId ?? null,
      position,
      original_text: line.text,
      amount: line.amount,
      unit: line.unit,
      is_vague: line.amount === null,
    })),
  );
  if (added.error) throw added.error;
  return { recipeId: recipe.data.id, updatedAt: recipe.data.updated_at };
}

async function unitsOf(db: Db, recipeId: string): Promise<[string, number | null, string | null][]> {
  const { data, error } = await db
    .from("recipe_ingredient")
    .select("original_text, amount, unit")
    .eq("recipe_id", recipeId)
    .order("position");
  if (error) throw error;
  return data.map((row) => [row.original_text, row.amount, row.unit]);
}

beforeAll(async () => {
  user = await createTestUser("garlic-cloves");
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("garlic clove repair (20261108230000_garlic_cloves)", () => {
  it("gives saved clove lines unit klyfta, leaves the rest and the recipe's updated_at alone, and is idempotent", async () => {
    const garlic = await addIngredient(user.db, "vitlök");
    const clove = await addIngredient(user.db, "vitlöksklyfta");
    const lemon = await addIngredient(user.db, "citron");
    const { recipeId, updatedAt } = await addRecipe(user.db, [
      { text: "2 vitlöksklyftor", amount: 2, unit: null, ingredientId: garlic },
      { text: "3 klyftor vitlök, pressade", amount: 3, unit: "st", ingredientId: garlic },
      { text: "2 Stora Vitlöksklyftor", amount: 2, unit: null, ingredientId: garlic },
      { text: "1 vitlök", amount: 1, unit: null, ingredientId: garlic },
      { text: "1/2 vitlök", amount: 0.5, unit: "st", ingredientId: garlic },
      { text: "1 citron, i klyftor", amount: 1, unit: null, ingredientId: lemon },
      { text: "vitlöksklyftor efter smak", amount: null, unit: null, ingredientId: garlic },
      { text: "4 vitlöksklyftor", amount: 4, unit: null, ingredientId: clove },
      { text: "2 vitlöksklyftor", amount: 20, unit: "g", ingredientId: garlic },
    ]);
    const expected: [string, number | null, string | null][] = [
      ["2 vitlöksklyftor", 2, "klyfta"],
      ["3 klyftor vitlök, pressade", 3, "klyfta"],
      ["2 Stora Vitlöksklyftor", 2, "klyfta"],
      ["1 vitlök", 1, null],
      ["1/2 vitlök", 0.5, "st"],
      ["1 citron, i klyftor", 1, null],
      ["vitlöksklyftor efter smak", null, null],
      // The catalog ingredient is the clove itself: 4 st of it is right.
      ["4 vitlöksklyftor", 4, null],
      ["2 vitlöksklyftor", 20, "g"],
    ];

    runRepair();
    expect(await unitsOf(user.db, recipeId)).toEqual(expected);
    const recipe = await user.db.from("recipe").select("updated_at").eq("id", recipeId).single();
    if (recipe.error) throw recipe.error;
    expect(recipe.data.updated_at).toBe(updatedAt);

    runRepair();
    expect(await unitsOf(user.db, recipeId)).toEqual(expected);
  });
});

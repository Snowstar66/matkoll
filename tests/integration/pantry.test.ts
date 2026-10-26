import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadIngredientNames } from "@/features/catalog/data/queries";
import { countPantryIn, listPantryIn, loadPantrySnapshot } from "@/features/pantry/data/queries";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, expectRlsIsolation, type Db, type TestUser } from "./support";

// The pantry against local Supabase (AD-4, AD-19, AD-20): RLS on pantry_item,
// the unique key with unlimited items, the composite foreign key to the
// catalog, the check constraints, and listPantry and getPantrySnapshot's
// queries against real rows.

let unique = 0;
const uniqueName = (base: string) => `${base} ${Date.now()}-${unique++}`;
const madeUpId = "00000000-0000-4000-8000-000000000000";

async function addIngredient(db: Db, name: string, location = "Kyl"): Promise<string> {
  const { data, error } = await db
    .from("ingredient")
    .insert({ name, normalized_name: name.toLocaleLowerCase("sv-SE"), section: "Övrigt", location })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

type Row = { ingredient_id: string; location: string; amount?: number | null; unit?: string | null };

async function addItems(db: Db, rows: Row[]): Promise<void> {
  const { error } = await db.from("pantry_item").insert(rows);
  if (error) throw error;
}

const names = (user: TestUser) => (ids: readonly string[]) => loadIngredientNames(user.db, ids);

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("schema and RLS", () => {
  it("isolates pantry_item", async () => {
    await expectRlsIsolation("pantry_item", async (owner) => ({
      ingredient_id: await addIngredient(owner, uniqueName("Mjölk")),
      location: "Kyl",
      amount: 1,
      unit: "l",
    }));
  });

  it("keeps one row per ingredient, location and unit, also for unlimited items", async () => {
    const user = await createTestUser("pantry-unique");
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));

    await addItems(user.db, [{ ingredient_id: salt, location: "Skafferi" }]);
    const unlimitedAgain = await user.db.from("pantry_item").insert({ ingredient_id: salt, location: "Skafferi" });
    expect(unlimitedAgain.error?.code, "a second unlimited row (nulls not distinct)").toBe("23505");

    await addItems(user.db, [{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const sameUnit = await user.db.from("pantry_item").insert({ ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" });
    expect(sameUnit.error?.code, "same ingredient, location and unit").toBe("23505");

    // Another unit, another location, or unlimited next to an amount are other rows.
    await addItems(user.db, [
      { ingredient_id: mjolk, location: "Kyl", amount: 5, unit: "dl" },
      { ingredient_id: mjolk, location: "Frys", amount: 1, unit: "l" },
      { ingredient_id: mjolk, location: "Kyl" },
      { ingredient_id: salt, location: "Kyl" },
    ]);

    // Another user may have the same row for their own ingredient.
    const other = await createTestUser("pantry-unique-other");
    const othersSalt = await addIngredient(other.db, uniqueName("Salt"), "Skafferi");
    await addItems(other.db, [{ ingredient_id: othersSalt, location: "Skafferi" }]);
  });

  it("refuses another user's ingredient and an unknown one", async () => {
    const owner = await createTestUser("pantry-fk");
    const other = await createTestUser("pantry-fk-other");
    const othersIngredient = await addIngredient(other.db, uniqueName("Smör"));

    for (const ingredientId of [othersIngredient, madeUpId]) {
      const { error } = await owner.db.from("pantry_item").insert({ ingredient_id: ingredientId, location: "Kyl" });
      expect(error?.code, ingredientId).toBe("23503");
    }
  });

  it("refuses an amount of a million or more, NaN and Infinity, and takes one just below", async () => {
    const user = await createTestUser("pantry-max");
    const ingredientId = await addIngredient(user.db, uniqueName("Ris"));
    // NaN and Infinity cannot be JSON numbers, so they go as text, which Postgres reads as numeric.
    for (const amount of [1e6, 1e7, "NaN", "Infinity"]) {
      const { error } = await user.db
        .from("pantry_item")
        .insert({ ingredient_id: ingredientId, location: "Skafferi", amount: amount as number, unit: "g" });
      expect(error?.code, String(amount)).toBe("23514");
    }
    await addItems(user.db, [{ ingredient_id: ingredientId, location: "Skafferi", amount: 999999.5, unit: "g" }]);
  });

  it("refuses an unknown location or unit, an amount of 0 or less, and an amount without unit or the reverse", async () => {
    const user = await createTestUser("pantry-check");
    const ingredientId = await addIngredient(user.db, uniqueName("Ägg"));
    const refused: Omit<Row, "ingredient_id">[] = [
      { location: "Garage" },
      { location: "kyl" },
      { location: "Kyl", amount: 1, unit: "näve" },
      { location: "Kyl", amount: 0, unit: "st" },
      { location: "Kyl", amount: -1, unit: "st" },
      { location: "Kyl", amount: 6, unit: null },
      { location: "Kyl", amount: null, unit: "st" },
    ];
    for (const row of refused) {
      const { error } = await user.db.from("pantry_item").insert({ ingredient_id: ingredientId, ...row });
      expect(error?.code, JSON.stringify(row)).toBe("23514");
    }
    const { count } = await adminClient()
      .from("pantry_item")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    expect(count).toBe(0);
  });
});

describe("deleting a user", () => {
  it("takes their pantry and catalog with them, although the pantry's catalog key is restrict", async () => {
    const user = await createTestUser("pantry-delete-user");
    const ingredientId = await addIngredient(user.db, uniqueName("Mjölk"));
    await addItems(user.db, [{ ingredient_id: ingredientId, location: "Kyl", amount: 1, unit: "l" }]);
    // A recipe line pointing at the same ingredient, whose catalog key is restrict too.
    const recipe = await user.db
      .from("recipe")
      .insert({ title: "Gröt", original_servings: 1, source_kind: "text" })
      .select("id")
      .single();
    if (recipe.error) throw recipe.error;
    const line = await user.db.from("recipe_ingredient").insert({
      recipe_id: recipe.data.id,
      ingredient_id: ingredientId,
      position: 0,
      original_text: "1 l mjölk",
      amount: 1,
      unit: "l",
      is_vague: false,
    });
    expect(line.error).toBeNull();

    const { error } = await adminClient().auth.admin.deleteUser(user.id);
    expect(error).toBeNull();
    for (const table of ["pantry_item", "recipe_ingredient", "ingredient"] as const) {
      const { count } = await adminClient().from(table).select("id", { count: "exact", head: true }).eq("user_id", user.id);
      expect(count, table).toBe(0);
    }
  });
});

describe("listPantry, countPantryItems and getPantrySnapshot", () => {
  it("lists one location's items with names, sorted by name, and counts each location", async () => {
    const user = await createTestUser("pantry-list");
    const other = await createTestUser("pantry-list-other");
    const run = uniqueName("");
    const mjolk = await addIngredient(user.db, `Mjölk${run}`);
    const smor = await addIngredient(user.db, `Smör${run}`);
    const agg = await addIngredient(user.db, `Ägg${run}`);
    const salt = await addIngredient(user.db, `Salt${run}`, "Skafferi");
    const arter = await addIngredient(user.db, `Ärtor${run}`, "Frys");
    await addItems(user.db, [
      { ingredient_id: smor, location: "Kyl", amount: 250, unit: "g" },
      { ingredient_id: agg, location: "Kyl", amount: 6, unit: "st" },
      { ingredient_id: mjolk, location: "Kyl", amount: 1.5, unit: "l" },
      { ingredient_id: salt, location: "Kyl" },
      { ingredient_id: arter, location: "Frys", amount: 500, unit: "g" },
    ]);
    const othersMjolk = await addIngredient(other.db, `Mjölk${run}`);
    await addItems(other.db, [{ ingredient_id: othersMjolk, location: "Kyl", amount: 9, unit: "l" }]);

    const kyl = await listPantryIn(user.db, "Kyl", names(user));
    expect(kyl.map(({ name, location, amount, unit }) => ({ name, location, amount, unit }))).toEqual([
      { name: `Mjölk${run}`, location: "Kyl", amount: 1.5, unit: "l" },
      { name: `Salt${run}`, location: "Kyl", amount: null, unit: null },
      { name: `Smör${run}`, location: "Kyl", amount: 250, unit: "g" },
      { name: `Ägg${run}`, location: "Kyl", amount: 6, unit: "st" },
    ]);
    expect(kyl[0]).toMatchObject({ ingredientId: mjolk, id: expect.any(String) });

    expect(await listPantryIn(user.db, "Skafferi", names(user))).toEqual([]);
    expect(await countPantryIn(user.db)).toEqual({ Kyl: 4, Frys: 1, Skafferi: 0 });
    expect(await countPantryIn(other.db)).toEqual({ Kyl: 1, Frys: 0, Skafferi: 0 });
  });

  it("sums the snapshot over locations per ingredient and unit", async () => {
    const user = await createTestUser("pantry-snapshot");
    const other = await createTestUser("pantry-snapshot-other");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    await addItems(user.db, [
      { ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { ingredient_id: mjolk, location: "Frys", amount: 1, unit: "l" },
      { ingredient_id: salt, location: "Skafferi" },
    ]);
    const othersMjolk = await addIngredient(other.db, uniqueName("Mjölk"));
    await addItems(other.db, [{ ingredient_id: othersMjolk, location: "Kyl", amount: 3, unit: "l" }]);

    expect(await loadPantrySnapshot(user.db)).toEqual(
      new Map([
        [mjolk, { unlimited: false, amounts: [{ unit: "l", amount: 2 }] }],
        [salt, { unlimited: true, amounts: [] }],
      ]),
    );
    expect(await loadPantrySnapshot((await createTestUser("pantry-empty")).db)).toEqual(new Map());
  });

  it("reads more rows than one page holds", async () => {
    const user = await createTestUser("pantry-many");
    const total = 1001;
    const created = await user.db
      .from("ingredient")
      .insert(
        Array.from({ length: total }, (_, index) => {
          const name = `Vara ${String(index).padStart(4, "0")}`;
          return { name, normalized_name: name.toLocaleLowerCase("sv-SE"), section: "Övrigt", location: "Skafferi" };
        }),
      )
      .select("id");
    if (created.error) throw created.error;
    const inserted = await adminClient()
      .from("pantry_item")
      .insert(created.data.map((row) => ({ user_id: user.id, ingredient_id: row.id, location: "Skafferi" })));
    if (inserted.error) throw inserted.error;

    try {
      const listed = await listPantryIn(user.db, "Skafferi", names(user));
      expect(listed).toHaveLength(total);
      expect(new Set(listed.map((entry) => entry.id)).size).toBe(total);
      expect(listed[0].name).toBe("Vara 0000");
      expect(listed[total - 1].name).toBe("Vara 1000");
      const snapshot = await loadPantrySnapshot(user.db);
      expect(snapshot.size).toBe(total);
      expect(created.data.every((row) => snapshot.get(row.id)?.unlimited)).toBe(true);
      expect(await countPantryIn(user.db)).toEqual({ Kyl: 0, Frys: 0, Skafferi: total });
    } finally {
      const removed = await adminClient().from("pantry_item").delete().eq("user_id", user.id);
      if (removed.error) throw removed.error;
    }
  });
});

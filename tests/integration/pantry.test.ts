import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitIngredients } from "@/features/catalog/data/commit";
import { loadIngredientDefaults, loadIngredientNames } from "@/features/catalog/data/queries";
import { addToPantryIn, findPantryAdditionsIn, forgetPantryAdditionsIn } from "@/features/pantry/data/add";
import { PantryDataError } from "@/features/pantry/data/client";
import { countPantryIn, listPantryIn, loadPantrySnapshot } from "@/features/pantry/data/queries";
import { removePantryItemIn, restorePantryItemIn } from "@/features/pantry/data/remove";
import { setPantryItemsIn } from "@/features/pantry/data/set";
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

// The pantry against local Supabase (AD-4, AD-19, AD-20): RLS on pantry_item,
// the unique key with unlimited items, the composite foreign key to the
// catalog, the check constraints, listPantry and getPantrySnapshot's
// queries against real rows, setPantryItems (set_pantry_items), and
// removePantryItem with restorePantryItem (restore_pantry_item), and
// addToPantry (add_to_pantry) with its receipts (pantry_addition).

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

/** The user's rows, as (ingredient, location, amount, unit) with their ids, read with the service role. */
async function rowsOf(userId: string) {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .select("id, ingredient_id, location, amount, unit")
    .eq("user_id", userId)
    .order("location")
    .order("unit", { nullsFirst: true });
  if (error) throw error;
  return data.map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount) }));
}

describe("setPantryItems", () => {
  it("creates the row, then sets the amount exactly on the same row", async () => {
    const user = await createTestUser("pantry-set");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));

    const [created] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1.5, unit: "l" }]);
    expect(created).toEqual({ id: expect.any(String), ingredientId: mjolk, location: "Kyl", amount: 1.5, unit: "l" });

    // Set, not increase: the row gets 2 l and keeps its id.
    const [again] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 2, unit: "l" }]);
    expect(again).toEqual({ ...created, amount: 2 });
    expect(await rowsOf(user.id)).toEqual([{ id: created.id, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" }]);
  });

  it("keeps an ingredient in a location either unlimited or with amounts", async () => {
    const user = await createTestUser("pantry-set-unlimited");
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    await addItems(user.db, [
      { ingredient_id: salt, location: "Skafferi", amount: 500, unit: "g" },
      { ingredient_id: salt, location: "Skafferi", amount: 1, unit: "förp" },
      { ingredient_id: salt, location: "Kyl", amount: 10, unit: "g" },
    ]);

    // Unlimited replaces the amounts in that location only.
    const [unlimited] = await setPantryItemsIn(user.db, [{ ingredientId: salt, location: "Skafferi", amount: null, unit: null }]);
    expect(unlimited).toMatchObject({ amount: null, unit: null });
    expect((await rowsOf(user.id)).map(({ location, amount, unit }) => ({ location, amount, unit }))).toEqual([
      { location: "Kyl", amount: 10, unit: "g" },
      { location: "Skafferi", amount: null, unit: null },
    ]);

    // An amount replaces the unlimited row.
    await setPantryItemsIn(user.db, [{ ingredientId: salt, location: "Skafferi", amount: 1, unit: "kg" }]);
    expect((await rowsOf(user.id)).map(({ location, amount, unit }) => ({ location, amount, unit }))).toEqual([
      { location: "Kyl", amount: 10, unit: "g" },
      { location: "Skafferi", amount: 1, unit: "kg" },
    ]);
  });

  it("moves a row to another location or unit, setting the amount of a row that is there already", async () => {
    const user = await createTestUser("pantry-set-move");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const [inKyl] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const [inFrys] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Frys", amount: 3, unit: "l" }]);

    // Kyl → Frys, where 3 l is already: the Frys row gets the new amount, the Kyl row goes.
    const [moved] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Frys", amount: 1, unit: "l" }], inKyl.id);
    expect(moved.id).toBe(inFrys.id);
    expect(await rowsOf(user.id)).toEqual([{ id: inFrys.id, ingredient_id: mjolk, location: "Frys", amount: 1, unit: "l" }]);

    // Another unit in the same location moves it too.
    const [inDl] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Frys", amount: 5, unit: "dl" }], inFrys.id);
    expect(await rowsOf(user.id)).toEqual([{ id: inDl.id, ingredient_id: mjolk, location: "Frys", amount: 5, unit: "dl" }]);

    // The same key keeps the row and its id.
    const [same] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Frys", amount: 6, unit: "dl" }], inDl.id);
    expect(same).toEqual({ ...inDl, amount: 6 });
  });

  it("sets an unlimited item twice on one row with the same id", async () => {
    const user = await createTestUser("pantry-set-unlimited-twice");
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    const unlimited = { ingredientId: salt, location: "Skafferi" as const, amount: null, unit: null };
    const [first] = await setPantryItemsIn(user.db, [unlimited]);
    const [second] = await setPantryItemsIn(user.db, [unlimited]);
    expect(second).toEqual(first);
    expect(await rowsOf(user.id)).toHaveLength(1);
  });

  it("applies items for the same ingredient and location in order: the last kind wins", async () => {
    const user = await createTestUser("pantry-set-mixed");
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    const unlimited = { ingredientId: salt, location: "Skafferi" as const, amount: null, unit: null };
    const kilo = { ingredientId: salt, location: "Skafferi" as const, amount: 1, unit: "kg" as const };

    const set = await setPantryItemsIn(user.db, [unlimited, kilo]);
    expect(set.map(({ amount, unit }) => ({ amount, unit }))).toEqual([
      { amount: null, unit: null },
      { amount: 1, unit: "kg" },
    ]);
    expect((await rowsOf(user.id)).map(({ amount, unit }) => ({ amount, unit }))).toEqual([{ amount: 1, unit: "kg" }]);

    await setPantryItemsIn(user.db, [kilo, unlimited]);
    expect((await rowsOf(user.id)).map(({ amount, unit }) => ({ amount, unit }))).toEqual([{ amount: null, unit: null }]);
  });

  it("swaps the ingredient of a row", async () => {
    const user = await createTestUser("pantry-set-swap");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const gulLok = await addIngredient(user.db, uniqueName("Gul lök"));
    const [row] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const [swapped] = await setPantryItemsIn(user.db, [{ ingredientId: gulLok, location: "Kyl", amount: 1, unit: "l" }], row.id);
    expect(await rowsOf(user.id)).toEqual([{ id: swapped.id, ingredient_id: gulLok, location: "Kyl", amount: 1, unit: "l" }]);
  });

  it("moves an unlimited row onto an unlimited row that is there, keeping the target's id", async () => {
    const user = await createTestUser("pantry-set-move-unlimited");
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    const [inKyl] = await setPantryItemsIn(user.db, [{ ingredientId: salt, location: "Kyl", amount: null, unit: null }]);
    const [inSkafferi] = await setPantryItemsIn(user.db, [{ ingredientId: salt, location: "Skafferi", amount: null, unit: null }]);
    const [moved] = await setPantryItemsIn(user.db, [{ ingredientId: salt, location: "Skafferi", amount: null, unit: null }], inKyl.id);
    expect(moved.id).toBe(inSkafferi.id);
    expect(await rowsOf(user.id)).toEqual([
      { id: inSkafferi.id, ingredient_id: salt, location: "Skafferi", amount: null, unit: null },
    ]);
  });

  it("refuses no items, and anyone who is not a signed-in user", async () => {
    const user = await createTestUser("pantry-set-guard");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const empty = await user.db.rpc("set_pantry_items", { items: [] });
    expect(empty.error?.code).toBe("22023");
    // No grant for service_role, which has no user to save for.
    const service = await adminClient().rpc("set_pantry_items", {
      items: [{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }],
    });
    expect(service.error?.code).toBe("42501");
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("moves all or nothing", async () => {
    const user = await createTestUser("pantry-set-atomic");
    const other = await createTestUser("pantry-set-atomic-other");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const othersIngredient = await addIngredient(other.db, uniqueName("Smör"));
    const [row] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const before = await rowsOf(user.id);

    // Another user's ingredient (foreign key) and a unit the check refuses: the old row stays.
    await expect(
      setPantryItemsIn(user.db, [{ ingredientId: othersIngredient, location: "Frys", amount: 1, unit: "l" }], row.id),
    ).rejects.toThrow(new PantryDataError("set_failed 23503"));
    const refused = await user.db.rpc("set_pantry_items", {
      items: [{ ingredient_id: mjolk, location: "Frys", amount: 1, unit: "näve" }],
      replace_id: row.id,
    });
    expect(refused.error?.code).toBe("23514");
    const unitWithoutAmount = await user.db.rpc("set_pantry_items", {
      items: [{ ingredient_id: mjolk, location: "Frys", amount: null, unit: "l" }],
      replace_id: row.id,
    });
    expect(unitWithoutAmount.error?.code).toBe("23514");
    expect(await rowsOf(user.id)).toEqual(before);
    expect(await rowsOf(other.id)).toEqual([]);
  });

  it("refuses invalid items before calling the database", async () => {
    const user = await createTestUser("pantry-set-invalid");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    for (const items of [[], [{ ingredientId: mjolk, location: "Kyl" as const, amount: 1, unit: null }]]) {
      await expect(setPantryItemsIn(user.db, items)).rejects.toThrow(new PantryDataError("invalid_items"));
    }
    await expect(
      setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }], "rad-1"),
    ).rejects.toThrow(new PantryDataError("invalid_items"));
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("is not for anon, and never touches another user's rows", async () => {
    const owner = await createTestUser("pantry-set-rls");
    const other = await createTestUser("pantry-set-rls-other");
    const mjolk = await addIngredient(owner.db, uniqueName("Mjölk"));
    const [row] = await setPantryItemsIn(owner.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const before = await rowsOf(owner.id);

    const anon = await anonClient().rpc("set_pantry_items", {
      items: [{ ingredient_id: mjolk, location: "Kyl", amount: 9, unit: "l" }],
    });
    expect(anon.error?.code).toBe("42501");

    // The other user cannot set the owner's ingredient, nor remove the owner's row as the one being replaced.
    const othersSalt = await addIngredient(other.db, uniqueName("Salt"));
    const foreign = await other.db.rpc("set_pantry_items", {
      items: [{ ingredient_id: mjolk, location: "Kyl", amount: 9, unit: "l" }],
    });
    expect(foreign.error?.code).toBe("23503");
    const replaced = await other.db.rpc("set_pantry_items", {
      items: [{ ingredient_id: othersSalt, location: "Kyl", amount: null, unit: null }],
      replace_id: row.id,
    });
    expect(replaced.error).toBeNull();
    expect(await rowsOf(owner.id)).toEqual(before);
    expect((await rowsOf(other.id)).map(({ ingredient_id }) => ingredient_id)).toEqual([othersSalt]);
  });
});

describe("removePantryItem and restorePantryItem", () => {
  it("removes a row for good, returns it, and puts it back with the same id, amount, unit and location", async () => {
    const user = await createTestUser("pantry-remove");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    const [inFrys, unlimited] = await setPantryItemsIn(user.db, [
      { ingredientId: mjolk, location: "Frys", amount: 1.5, unit: "l" },
      { ingredientId: salt, location: "Skafferi", amount: null, unit: null },
    ]);
    const before = await rowsOf(user.id);

    for (const row of [inFrys, unlimited]) {
      expect(await removePantryItemIn(user.db, user.id, row.id)).toEqual({ row });
    }
    expect(await rowsOf(user.id)).toEqual([]);

    for (const row of [inFrys, unlimited]) {
      expect(await restorePantryItemIn(user.db, row)).toEqual(row);
    }
    expect(await rowsOf(user.id)).toEqual(before);
  });

  it("gives null for a row that is gone already, and changes nothing", async () => {
    const user = await createTestUser("pantry-remove-gone");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const [row] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    await removePantryItemIn(user.db, user.id, row.id);
    expect(await removePantryItemIn(user.db, user.id, row.id)).toBeNull();
    expect(await removePantryItemIn(user.db, user.id, madeUpId)).toBeNull();
  });

  it("refuses to restore when the location has the item again, and keeps the new row", async () => {
    const user = await createTestUser("pantry-restore-taken");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const [row] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    await removePantryItemIn(user.db, user.id, row.id);

    // The same key: Mjölk in l in Kyl.
    const [again] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 3, unit: "l" }]);
    await expect(restorePantryItemIn(user.db, row)).rejects.toThrow(new PantryDataError("restore_failed 23505"));
    expect(await rowsOf(user.id)).toEqual([{ id: again.id, ingredient_id: mjolk, location: "Kyl", amount: 3, unit: "l" }]);
  });

  it("refuses to restore an item of the other kind than the location has now: unlimited or amounts", async () => {
    const user = await createTestUser("pantry-restore-kind");
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    const [amount] = await setPantryItemsIn(user.db, [{ ingredientId: salt, location: "Skafferi", amount: 1, unit: "kg" }]);
    await removePantryItemIn(user.db, user.id, amount.id);
    const [unlimited] = await setPantryItemsIn(user.db, [{ ingredientId: salt, location: "Skafferi", amount: null, unit: null }]);
    await expect(restorePantryItemIn(user.db, amount)).rejects.toThrow(new PantryDataError("restore_failed 23505"));

    await removePantryItemIn(user.db, user.id, unlimited.id);
    const [inGram] = await setPantryItemsIn(user.db, [{ ingredientId: salt, location: "Skafferi", amount: 500, unit: "g" }]);
    await expect(restorePantryItemIn(user.db, unlimited)).rejects.toThrow(new PantryDataError("restore_failed 23505"));
    expect(await rowsOf(user.id)).toEqual([{ id: inGram.id, ingredient_id: salt, location: "Skafferi", amount: 500, unit: "g" }]);
  });

  it("restores next to the ingredient in another unit or location, and refuses the same id twice", async () => {
    const user = await createTestUser("pantry-restore-other");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const [row] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    await removePantryItemIn(user.db, user.id, row.id);
    await setPantryItemsIn(user.db, [
      { ingredientId: mjolk, location: "Kyl", amount: 5, unit: "dl" },
      { ingredientId: mjolk, location: "Frys", amount: 1, unit: "l" },
    ]);
    expect(await restorePantryItemIn(user.db, row)).toEqual(row);
    await expect(restorePantryItemIn(user.db, row)).rejects.toThrow(new PantryDataError("restore_failed 23505"));
    expect(await rowsOf(user.id)).toHaveLength(3);
  });

  it("refuses an invalid id or row before calling the database", async () => {
    const user = await createTestUser("pantry-remove-invalid");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    await expect(removePantryItemIn(user.db, user.id, "rad-1")).rejects.toThrow(new PantryDataError("invalid_id"));
    await expect(
      restorePantryItemIn(user.db, { id: "rad-1", ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }),
    ).rejects.toThrow(new PantryDataError("invalid_row"));
    await expect(
      restorePantryItemIn(user.db, { id: madeUpId, ingredientId: mjolk, location: "Kyl", amount: 1, unit: null }),
    ).rejects.toThrow(new PantryDataError("invalid_row"));
    const noId = await user.db.rpc("restore_pantry_item", { item: { ingredient_id: mjolk, location: "Kyl" } });
    expect(noId.error?.code).toBe("22023");
    expect(await rowsOf(user.id)).toEqual([]);
  });

  it("never removes or restores another user's row, and is not for anon or the service role", async () => {
    const owner = await createTestUser("pantry-remove-rls");
    const other = await createTestUser("pantry-remove-rls-other");
    const mjolk = await addIngredient(owner.db, uniqueName("Mjölk"));
    const [row, kept] = await setPantryItemsIn(owner.db, [
      { ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { ingredientId: mjolk, location: "Frys", amount: 2, unit: "l" },
    ]);

    // The other user's delete, by their own user id or the owner's, reaches nothing (RLS).
    expect(await removePantryItemIn(other.db, other.id, row.id)).toBeNull();
    expect(await removePantryItemIn(other.db, owner.id, row.id)).toBeNull();
    const direct = await other.db.from("pantry_item").delete().eq("id", row.id).select("id");
    expect(direct.data).toEqual([]);
    expect(await rowsOf(owner.id)).toHaveLength(2);

    // Restoring the owner's removed row as another user: the ingredient is not in their catalog.
    await removePantryItemIn(owner.db, owner.id, row.id);
    await expect(restorePantryItemIn(other.db, row)).rejects.toThrow(new PantryDataError("restore_failed 23503"));
    // An id the owner's row has is taken, whoever asks.
    const othersSalt = await addIngredient(other.db, uniqueName("Salt"));
    await expect(
      restorePantryItemIn(other.db, { id: kept.id, ingredientId: othersSalt, location: "Kyl", amount: null, unit: null }),
    ).rejects.toThrow(new PantryDataError("restore_failed 23505"));
    expect(await rowsOf(other.id)).toEqual([]);

    const item = { id: row.id, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" };
    const anon = await anonClient().rpc("restore_pantry_item", { item });
    expect(anon.error?.code).toBe("42501");
    const service = await adminClient().rpc("restore_pantry_item", { item });
    expect(service.error?.code).toBe("42501");
    // The lock both functions take is for signed-in users only.
    expect((await anonClient().rpc("pantry_lock")).error?.code).toBe("42501");
    expect((await adminClient().rpc("pantry_lock")).error?.code).toBe("42501");
    expect((await owner.db.rpc("pantry_lock")).error).toBeNull();
    expect(await rowsOf(owner.id)).toEqual([{ id: kept.id, ingredient_id: mjolk, location: "Frys", amount: 2, unit: "l" }]);
  });
});

describe("the catalog for the sheet Lagervara", () => {
  it("gives a retried new ingredient the id it got the first time, so a failed save creates no duplicate", async () => {
    const user = await createTestUser("pantry-commit-retry");
    const name = uniqueName("Saffran");
    const choice = {
      text: name,
      ingredient: { kind: "new" as const, proposal: { name, section: "Skafferi" as const, location: "Skafferi" as const, defaultUnit: null } },
    };
    const [first] = await commitIngredients(user.db, [choice]);
    const [again] = await commitIngredients(user.db, [{ ...choice, text: ` ${name.toUpperCase()} ` }]);
    expect(again).toBe(first);
    expect(await countRows("ingredient", user.id)).toBe(1);
  });

  it("gives the section, location and default unit of the user's own ingredients", async () => {
    const user = await createTestUser("pantry-defaults");
    const other = await createTestUser("pantry-defaults-other");
    const { data, error } = await user.db
      .from("ingredient")
      .insert({ name: uniqueName("Gul lök"), normalized_name: uniqueName("gul lök"), section: "Frukt och grönt", location: "Skafferi", default_unit: "st" })
      .select("id")
      .single();
    if (error) throw error;
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    const othersId = await addIngredient(other.db, uniqueName("Smör"));

    expect(await loadIngredientDefaults(user.db, [data.id, salt, othersId, data.id])).toEqual({
      [data.id]: { section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" },
      [salt]: { section: "Övrigt", location: "Skafferi", defaultUnit: null },
    });
    expect(await loadIngredientDefaults(user.db, [])).toEqual({});
  });
});

describe("addToPantry", () => {
  const locations = (user: TestUser) => (ids: readonly string[]) => loadIngredientDefaults(user.db, ids);
  const add = (user: TestUser, items: Parameters<typeof addToPantryIn>[1]) => addToPantryIn(user.db, items, locations(user));
  const view = (rows: Awaited<ReturnType<typeof rowsOf>>) =>
    rows.map(({ ingredient_id, location, amount, unit }) => ({ ingredient_id, location, amount, unit }));
  async function receiptsOf(userId: string): Promise<string[]> {
    const { data, error } = await adminClient().from("pantry_addition").select("key").eq("user_id", userId).order("key");
    if (error) throw error;
    return data.map((row) => row.key);
  }

  it("isolates pantry_addition", async () => {
    await expectRlsIsolation("pantry_addition", async () => ({ key: randomUUID() }));
  });

  it("increases the row with the same unit, adds a new row beside another unit, and creates a missing item in the catalog's location", async () => {
    const user = await createTestUser("pantry-add");
    const gradde = await addIngredient(user.db, uniqueName("Grädde"), "Kyl");
    const mjol = await addIngredient(user.db, uniqueName("Mjöl"), "Skafferi");
    const paprika = await addIngredient(user.db, uniqueName("Paprika"), "Kyl");
    await addItems(user.db, [
      { ingredient_id: gradde, location: "Kyl", amount: 2, unit: "dl" },
      { ingredient_id: mjol, location: "Skafferi", amount: 1, unit: "kg" },
    ]);

    const added = await add(user, [
      { key: randomUUID(), ingredientId: gradde, amount: 3, unit: "dl" },
      { key: randomUUID(), ingredientId: mjol, amount: 2, unit: "dl" },
      { key: randomUUID(), ingredientId: paprika, amount: 2, unit: "st" },
    ]);
    expect(added).toBe(3);
    const rows = view(await rowsOf(user.id));
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining([
        { ingredient_id: gradde, location: "Kyl", amount: 5, unit: "dl" },
        { ingredient_id: mjol, location: "Skafferi", amount: 1, unit: "kg" },
        { ingredient_id: mjol, location: "Skafferi", amount: 2, unit: "dl" },
        { ingredient_id: paprika, location: "Kyl", amount: 2, unit: "st" },
      ]),
    );
    expect(await receiptsOf(user.id)).toHaveLength(3);
  });

  it("adds to the location given, and the same ingredient twice in one call", async () => {
    const user = await createTestUser("pantry-add-location");
    const kaffe = await addIngredient(user.db, uniqueName("Kaffe"), "Skafferi");
    await add(user, [
      { key: randomUUID(), ingredientId: kaffe, amount: 1, unit: "förp", location: "Frys" },
      { key: randomUUID(), ingredientId: kaffe, amount: 2, unit: "förp", location: "Frys" },
    ]);
    expect(view(await rowsOf(user.id))).toEqual([{ ingredient_id: kaffe, location: "Frys", amount: 3, unit: "förp" }]);
  });

  it("leaves an ingredient that is unlimited anywhere as it is, but counts and keeps the item", async () => {
    const user = await createTestUser("pantry-add-unlimited");
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    await addItems(user.db, [{ ingredient_id: salt, location: "Kyl" }]);
    const before = await rowsOf(user.id);
    const key = randomUUID();
    expect(await add(user, [{ key, ingredientId: salt, amount: 1, unit: "tsk" }])).toBe(1);
    expect(await add(user, [{ key: randomUUID(), ingredientId: salt, amount: null, unit: null }])).toBe(1);
    expect(await rowsOf(user.id)).toEqual(before);
    expect(await receiptsOf(user.id)).toContain(key);
  });

  it("makes an item without amount unlimited in the catalog's location, replacing the amounts there only", async () => {
    const user = await createTestUser("pantry-add-vague");
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    const kaffe = await addIngredient(user.db, uniqueName("Kaffe"), "Skafferi");
    await addItems(user.db, [
      { ingredient_id: kaffe, location: "Skafferi", amount: 1, unit: "förp" },
      { ingredient_id: kaffe, location: "Frys", amount: 2, unit: "förp" },
    ]);
    await add(user, [
      { key: randomUUID(), ingredientId: salt, amount: null, unit: null },
      { key: randomUUID(), ingredientId: kaffe, amount: null, unit: null },
    ]);
    const rows = view(await rowsOf(user.id));
    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        { ingredient_id: salt, location: "Skafferi", amount: null, unit: null },
        { ingredient_id: kaffe, location: "Skafferi", amount: null, unit: null },
        { ingredient_id: kaffe, location: "Frys", amount: 2, unit: "förp" },
      ]),
    );
  });

  it("adds an item once per key: a second run, or the key twice in one call, changes nothing more", async () => {
    const user = await createTestUser("pantry-add-once");
    const gradde = await addIngredient(user.db, uniqueName("Grädde"), "Kyl");
    const key = randomUUID();
    const item = { key, ingredientId: gradde, amount: 3, unit: "dl" as const };
    expect(await add(user, [item, item])).toBe(1);
    expect(await add(user, [item])).toBe(0);
    expect(view(await rowsOf(user.id))).toEqual([{ ingredient_id: gradde, location: "Kyl", amount: 3, unit: "dl" }]);
    expect(await findPantryAdditionsIn(user.db, [key, randomUUID()])).toEqual([key]);
  });

  it("adds all or nothing, receipts too", async () => {
    const user = await createTestUser("pantry-add-atomic");
    const other = await createTestUser("pantry-add-atomic-other");
    const gradde = await addIngredient(user.db, uniqueName("Grädde"), "Kyl");
    const othersSalt = await addIngredient(other.db, uniqueName("Salt"), "Skafferi");
    // Another user's ingredient: the foreign key refuses it, and the first item goes too.
    const refused = await user.db.rpc("add_to_pantry", {
      items: [
        { key: randomUUID(), ingredient_id: gradde, location: "Kyl", amount: 3, unit: "dl" },
        { key: randomUUID(), ingredient_id: othersSalt, location: "Skafferi", amount: 1, unit: "st" },
      ],
    });
    expect(refused.error?.code).toBe("23503");
    // An ingredient the catalog does not have for the user is refused before the call, also with a location.
    for (const location of [undefined, "Skafferi" as const]) {
      await expect(
        add(user, [
          { key: randomUUID(), ingredientId: gradde, amount: 3, unit: "dl" },
          { key: randomUUID(), ingredientId: othersSalt, amount: 1, unit: "st", ...(location ? { location } : {}) },
        ]),
      ).rejects.toThrow(new PantryDataError("unknown_ingredient"));
    }
    expect(await rowsOf(user.id)).toEqual([]);
    expect(await receiptsOf(user.id)).toEqual([]);
    expect(await rowsOf(other.id)).toEqual([]);
  });

  it("deletes receipts older than 30 days, so their keys could add again", async () => {
    const user = await createTestUser("pantry-add-old");
    const gradde = await addIngredient(user.db, uniqueName("Grädde"), "Kyl");
    const old = randomUUID();
    const recent = randomUUID();
    const { error } = await adminClient()
      .from("pantry_addition")
      .insert([
        { user_id: user.id, key: old, created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() },
        { user_id: user.id, key: recent, created_at: new Date(Date.now() - 29 * 86_400_000).toISOString() },
      ]);
    if (error) throw error;
    await add(user, [{ key: randomUUID(), ingredientId: gradde, amount: 1, unit: "dl" }]);
    const receipts = await receiptsOf(user.id);
    expect(receipts).not.toContain(old);
    expect(receipts).toContain(recent);
  });

  it("is only for a signed-in user, with at least one item, and never reads another user's receipts", async () => {
    const user = await createTestUser("pantry-add-guard");
    const other = await createTestUser("pantry-add-guard-other");
    const gradde = await addIngredient(user.db, uniqueName("Grädde"), "Kyl");
    const items = [{ key: randomUUID(), ingredient_id: gradde, location: "Kyl", amount: 1, unit: "dl" }];
    expect((await user.db.rpc("add_to_pantry", { items: [] })).error?.code).toBe("22023");
    expect((await user.db.rpc("add_to_pantry", { items: [{ ...items[0], key: null }] })).error?.code).toBe("22023");
    expect((await anonClient().rpc("add_to_pantry", { items })).error?.code).toBe("42501");
    expect((await adminClient().rpc("add_to_pantry", { items })).error?.code).toBe("42501");
    expect(await rowsOf(user.id)).toEqual([]);

    expect(await user.db.rpc("add_to_pantry", { items })).toMatchObject({ data: 1, error: null });
    expect(await findPantryAdditionsIn(other.db, [items[0]!.key])).toEqual([]);
    // The other user's own key of the same text is theirs: it adds nothing to the owner.
    const othersGradde = await addIngredient(other.db, uniqueName("Grädde"), "Kyl");
    expect(await add(other, [{ key: items[0]!.key, ingredientId: othersGradde, amount: 1, unit: "dl" }])).toBe(1);
    expect(view(await rowsOf(user.id))).toEqual([{ ingredient_id: gradde, location: "Kyl", amount: 1, unit: "dl" }]);
  });
});

describe("addToPantry after review", () => {
  const locations = (user: TestUser) => (ids: readonly string[]) => loadIngredientDefaults(user.db, ids);

  it("caps a sum just below the pantry's maximum instead of refusing it", async () => {
    const user = await createTestUser("pantry-add-cap");
    const gradde = await addIngredient(user.db, uniqueName("Grädde"), "Kyl");
    await addItems(user.db, [{ ingredient_id: gradde, location: "Kyl", amount: 999_999, unit: "dl" }]);
    await addToPantryIn(user.db, [{ key: randomUUID(), ingredientId: gradde, amount: 2, unit: "dl" }], locations(user));
    const capped = await user.db.rpc("add_to_pantry", {
      items: [{ key: randomUUID(), ingredient_id: gradde, location: "Frys", amount: 5_000_000, unit: "dl" }],
    });
    expect(capped.error).toBeNull();
    expect((await rowsOf(user.id)).map(({ location, amount }) => [location, amount])).toEqual([
      ["Frys", 999_999.999],
      ["Kyl", 999_999.999],
    ]);
  });

  it.each([
    ["an amount of 0", { amount: 0, unit: "dl" }],
    ["a negative amount", { amount: -1, unit: "dl" }],
    ["an amount without unit", { amount: 1, unit: null }],
    ["a unit without amount", { amount: null, unit: "dl" }],
    ["an unknown unit", { amount: 1, unit: "näve" }],
    ["an unknown location", { amount: 1, unit: "dl", location: "Garage" }],
  ])("refuses %s with 22023, writing nothing", async (_, change) => {
    const user = await createTestUser(`pantry-add-input-${unique++}`);
    const gradde = await addIngredient(user.db, uniqueName("Grädde"), "Kyl");
    const good = { key: randomUUID(), ingredient_id: gradde, location: "Kyl", amount: 1, unit: "dl" };
    const refused = await user.db.rpc("add_to_pantry", { items: [good, { ...good, key: randomUUID(), ...change }] });
    expect(refused.error?.code).toBe("22023");
    expect(await rowsOf(user.id)).toEqual([]);
    expect(await countRows("pantry_addition", user.id)).toBe(0);
  });

  it("forgets receipts on request, so their keys could add again, and never another user's; nobody changes a receipt", async () => {
    const user = await createTestUser("pantry-add-forget");
    const other = await createTestUser("pantry-add-forget-other");
    const gradde = await addIngredient(user.db, uniqueName("Grädde"), "Kyl");
    const key = randomUUID();
    await addToPantryIn(user.db, [{ key, ingredientId: gradde, amount: 1, unit: "dl" }], locations(user));

    await forgetPantryAdditionsIn(other.db, [key]);
    expect(await findPantryAdditionsIn(user.db, [key])).toEqual([key]);
    const update = await user.db.from("pantry_addition").update({ key: "annan" }).eq("key", key).select("id");
    expect(update.error?.code).toBe("42501");

    await forgetPantryAdditionsIn(user.db, [key]);
    expect(await findPantryAdditionsIn(user.db, [key])).toEqual([]);
    expect(await addToPantryIn(user.db, [{ key, ingredientId: gradde, amount: 1, unit: "dl" }], locations(user))).toBe(1);
  });
});

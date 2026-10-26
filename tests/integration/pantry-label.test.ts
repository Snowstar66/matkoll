import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadIngredientSummaries } from "@/features/catalog/data/queries";
import { PantryDataError } from "@/features/pantry/data/client";
import { applyPantryInventoryIn } from "@/features/pantry/data/inventory";
import { listPantryIn } from "@/features/pantry/data/queries";
import {
  emptyPantryPlaceIn,
  removePantryItemIn,
  restorePantryItemIn,
  restorePantryRemovalIn,
} from "@/features/pantry/data/remove";
import { setPantryItemsIn } from "@/features/pantry/data/set";
import type { PantryItemSet } from "@/features/pantry/domain/pantry-item-form";
import { localSupabaseUrl } from "../local-supabase";
import { anonClient, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// Story 11.2 (FR-42, AD-19, AD-20) against local Supabase: pantry_item.label
// and what created_at means ("Tillagd") through set_pantry_items, a replaced
// row, add_to_pantry, restore_pantry_item, empty_pantry_place with
// restore_pantry_removal, apply_pantry_inventory, and RLS for another user.

let unique = 0;
const uniqueName = (base: string) => `${base} ${Date.now()}-${unique++}`;

async function addIngredient(db: Db, name: string, section = "Mejeri"): Promise<string> {
  const { data, error } = await db
    .from("ingredient")
    .insert({ name, normalized_name: name.toLocaleLowerCase("sv-SE"), section, location: "Kyl" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** The row as the table has it, read with the user's own client. */
async function rowOf(db: Db, id: string) {
  const { data, error } = await db.from("pantry_item").select("id, location, amount, unit, label, created_at").eq("id", id);
  if (error) throw error;
  return data[0] ?? null;
}

/** All of the user's rows for an ingredient. */
async function rowsFor(db: Db, ingredientId: string) {
  const { data, error } = await db
    .from("pantry_item")
    .select("id, location, amount, unit, label, created_at")
    .eq("ingredient_id", ingredientId)
    .order("created_at");
  if (error) throw error;
  return data;
}

/** Makes a row as old as `days` days, as if it was added then. */
async function age(db: Db, id: string, days: number): Promise<string> {
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db.from("pantry_item").update({ created_at: when }).eq("id", id);
  if (error) throw error;
  return (await rowOf(db, id))!.created_at;
}

const sameTime = (a: string, b: string) => expect(new Date(a).getTime()).toBe(new Date(b).getTime());

const kyl = (ingredientId: string, amount: number | null, unit: PantryItemSet["unit"], label?: string | null): PantryItemSet => ({
  ingredientId,
  location: "Kyl",
  amount,
  unit,
  ...(label === undefined ? {} : { label }),
});

let user: TestUser;

beforeAll(async () => {
  localSupabaseUrl();
  user = await createTestUser("pantry-label");
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("pantry_item.label", () => {
  it("is null on a new row, which is added now", async () => {
    const before = Date.now();
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const [row] = await setPantryItemsIn(user.db, [kyl(mjolk, 1, "l")]);
    const stored = (await rowOf(user.db, row.id))!;
    expect(stored.label).toBeNull();
    expect(new Date(stored.created_at).getTime()).toBeGreaterThanOrEqual(before - 5_000);
  });

  it("is set by a text, kept when left out, and removed by null", async () => {
    const mjolk = await addIngredient(user.db, uniqueName("Mellanmjölk"));
    const [row] = await setPantryItemsIn(user.db, [kyl(mjolk, 1, "förp", "Arla Mellanmjölk laktosfri 1,5 l")]);
    expect(row.label).toBe("Arla Mellanmjölk laktosfri 1,5 l");

    await setPantryItemsIn(user.db, [kyl(mjolk, 2, "förp")]);
    expect(await rowOf(user.db, row.id)).toMatchObject({ amount: 2, label: "Arla Mellanmjölk laktosfri 1,5 l" });

    await setPantryItemsIn(user.db, [kyl(mjolk, 2, "förp", "Arla")]);
    expect(await rowOf(user.db, row.id)).toMatchObject({ label: "Arla" });

    await setPantryItemsIn(user.db, [kyl(mjolk, 2, "förp", null)], row.id);
    expect(await rowOf(user.db, row.id)).toMatchObject({ label: null });
  });

  it("keeps created_at and the label when the amount changes on the same row", async () => {
    const graddfil = await addIngredient(user.db, uniqueName("Gräddfil"));
    const [row] = await setPantryItemsIn(user.db, [kyl(graddfil, 2, "förp", "Arla")]);
    const added = await age(user.db, row.id, 6);
    await setPantryItemsIn(user.db, [kyl(graddfil, 1, "förp")], row.id);
    const stored = (await rowOf(user.db, row.id))!;
    expect(stored).toMatchObject({ amount: 1, label: "Arla" });
    sameTime(stored.created_at, added);
  });

  it.each([
    ["another unit", (id: string) => kyl(id, 10, "dl")],
    ["another location", (id: string): PantryItemSet => ({ ingredientId: id, location: "Frys", amount: 1, unit: "kg" })],
  ])("gives a row replaced for %s its created_at and label", async (_case, changed) => {
    const mjol = await addIngredient(user.db, uniqueName("Mjöl"));
    const [row] = await setPantryItemsIn(user.db, [kyl(mjol, 1, "kg", "Kungsörnen")]);
    const added = await age(user.db, row.id, 4);
    const [moved] = await setPantryItemsIn(user.db, [changed(mjol)], row.id);
    expect(moved.id).not.toBe(row.id);
    expect(await rowOf(user.db, row.id)).toBeNull();
    const stored = (await rowOf(user.db, moved.id))!;
    expect(stored.label).toBe("Kungsörnen");
    sameTime(stored.created_at, added);
  });

  it("gives a replaced row's time, but the sheet's label when it sends one", async () => {
    const smor = await addIngredient(user.db, uniqueName("Smör"));
    const [row] = await setPantryItemsIn(user.db, [kyl(smor, 1, "förp", "Bregott")]);
    const added = await age(user.db, row.id, 3);
    const [moved] = await setPantryItemsIn(user.db, [{ ...kyl(smor, 1, "förp", null), location: "Frys" }], row.id);
    const stored = (await rowOf(user.db, moved.id))!;
    expect(stored.label).toBeNull();
    sameTime(stored.created_at, added);
  });

  it("gives the time and label of the other kind of row an item replaces (unlimited to an amount)", async () => {
    const salt = await addIngredient(user.db, uniqueName("Salt"));
    const [unlimited] = await setPantryItemsIn(user.db, [kyl(salt, null, null, "Falksalt")]);
    const added = await age(user.db, unlimited.id, 10);
    const [counted] = await setPantryItemsIn(user.db, [kyl(salt, 500, "g")]);
    const stored = (await rowOf(user.db, counted.id))!;
    expect(stored.label).toBe("Falksalt");
    sameTime(stored.created_at, added);
  });

  it("refuses a label the table does not take, and nothing changes", async () => {
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const [row] = await setPantryItemsIn(user.db, [kyl(mjolk, 1, "l", "Arla")]);
    // Through the domain: refused before the call.
    await expect(setPantryItemsIn(user.db, [kyl(mjolk, 1, "l", "a".repeat(61))])).rejects.toThrow(new PantryDataError("invalid_items"));
    await expect(setPantryItemsIn(user.db, [kyl(mjolk, 1, "l", "   ")])).rejects.toThrow(new PantryDataError("invalid_items"));
    // Straight to the function: the check refuses it (23514).
    for (const label of ["a".repeat(61), "   ", "", " Arla", "Arla\nlaktosfri"]) {
      const { error } = await user.db.rpc("set_pantry_items", {
        items: [{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l", label }],
      });
      expect(error?.code, JSON.stringify(label)).toBe("23514");
    }
    expect(await rowOf(user.db, row.id)).toMatchObject({ label: "Arla" });
  });

  it("is never touched by add_to_pantry, and a new row from it has none", async () => {
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const gradde = await addIngredient(user.db, uniqueName("Grädde"));
    const [row] = await setPantryItemsIn(user.db, [kyl(mjolk, 1, "l", "Arla")]);
    const added = await age(user.db, row.id, 2);
    const { error } = await user.db.rpc("add_to_pantry", {
      items: [
        { key: randomUUID(), ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
        { key: randomUUID(), ingredient_id: gradde, location: "Kyl", amount: 3, unit: "dl", label: "Arla" },
      ],
    });
    expect(error).toBeNull();
    const stored = (await rowOf(user.db, row.id))!;
    expect(stored).toMatchObject({ amount: 2, label: "Arla" });
    sameTime(stored.created_at, added);
    expect(await rowsFor(user.db, gradde)).toEqual([expect.objectContaining({ amount: 3, unit: "dl", label: null })]);
  });

  it("is read by listPantry with the time and the catalog's section", async () => {
    const yoghurt = await addIngredient(user.db, uniqueName("Yoghurt"), "Mejeri");
    const [row] = await setPantryItemsIn(user.db, [{ ...kyl(yoghurt, 1, "förp", "Lindahls"), location: "Skafferi" }]);
    const listed = await listPantryIn(user.db, "Skafferi", (ids) => loadIngredientSummaries(user.db, ids));
    const item = listed.find(({ id }) => id === row.id)!;
    expect(item).toMatchObject({ label: "Lindahls", section: "Mejeri" });
    sameTime(item.createdAt, (await rowOf(user.db, row.id))!.created_at);
  });
});

describe("Ångra keeps the label and created_at (AD-20)", () => {
  it("puts a removed row back with the same id, amount, label and time", async () => {
    const graddfil = await addIngredient(user.db, uniqueName("Gräddfil"));
    const [row] = await setPantryItemsIn(user.db, [kyl(graddfil, 2, "förp", "Arla")]);
    const added = await age(user.db, row.id, 6);
    const removed = await removePantryItemIn(user.db, user.id, row.id);
    expect(removed?.row).toMatchObject({ id: row.id, label: "Arla" });
    sameTime(removed!.row!.createdAt!, added);

    const restored = await restorePantryItemIn(user.db, removed!.row!);
    expect(restored).toMatchObject({ id: row.id, amount: 2, unit: "förp", label: "Arla" });
    const stored = (await rowOf(user.db, row.id))!;
    expect(stored).toMatchObject({ amount: 2, label: "Arla" });
    sameTime(stored.created_at, added);
  });

  it("makes a time in the future now, and a row without label or time comes back with null and now", async () => {
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const [row] = await setPantryItemsIn(user.db, [kyl(mjolk, 1, "l", "Arla")]);
    const removed = (await removePantryItemIn(user.db, user.id, row.id))!.row!;
    const inAnHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const before = Date.now();
    await restorePantryItemIn(user.db, { ...removed, createdAt: inAnHour });
    const forged = (await rowOf(user.db, row.id))!;
    expect(new Date(forged.created_at).getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
    expect(new Date(forged.created_at).getTime()).toBeGreaterThanOrEqual(before - 5_000);

    await removePantryItemIn(user.db, user.id, row.id);
    // As a row from before the story: no label, no time.
    await restorePantryItemIn(user.db, { ...removed, label: undefined, createdAt: undefined });
    expect(await rowOf(user.db, row.id)).toMatchObject({ label: null });
  });

  it("puts every row of an emptied place back with its label and time", async () => {
    const tom = await createTestUser("pantry-label-empty");
    const ids = await Promise.all(Array.from({ length: 14 }, (_, n) => addIngredient(tom.db, uniqueName(`Vara ${n}`))));
    const rows = await setPantryItemsIn(
      tom.db,
      ids.map((id, n) => kyl(id, n + 1, "st", n % 3 === 0 ? null : `Märke ${n}`)),
    );
    const times = new Map<string, string>();
    for (const [n, row] of rows.entries()) times.set(row.id, await age(tom.db, row.id, n));
    const before = new Map(rows.map((row) => [row.id, row.label ?? null]));

    const operation = randomUUID();
    expect(await emptyPantryPlaceIn(tom.db, "Kyl", operation, null)).toMatchObject({ removed: 14 });
    const restored = await restorePantryRemovalIn(tom.db, operation);
    expect(restored.restoredIds).toHaveLength(14);
    for (const row of rows) {
      const stored = (await rowOf(tom.db, row.id))!;
      expect(stored.label).toBe(before.get(row.id));
      sameTime(stored.created_at, times.get(row.id)!);
    }
  });

  it("puts a record stored before the story back with now and no label", async () => {
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const [row] = await setPantryItemsIn(user.db, [kyl(mjolk, 1, "l", "Arla")]);
    const { site_id: siteId } = (await user.db.from("pantry_item").select("site_id").eq("id", row.id).single()).data!;
    await removePantryItemIn(user.db, user.id, row.id);
    const operation = randomUUID();
    // As empty_pantry_place stored it before the migration: no label, no created_at.
    const { error } = await user.db.from("pantry_removal").insert({
      id: operation,
      removed_rows: [{ id: row.id, site_id: siteId, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }],
    });
    expect(error).toBeNull();
    const before = Date.now();
    expect((await restorePantryRemovalIn(user.db, operation)).restoredIds).toEqual([row.id]);
    const stored = (await rowOf(user.db, row.id))!;
    expect(stored.label).toBeNull();
    expect(new Date(stored.created_at).getTime()).toBeGreaterThanOrEqual(before - 5_000);
  });

  it("puts a row an inventory removed back with its label and time, and a replaced row passes them on", async () => {
    const inv = await createTestUser("pantry-label-inventory");
    const yoghurt = await addIngredient(inv.db, uniqueName("Yoghurt"));
    const mjolk = await addIngredient(inv.db, uniqueName("Mjölk"));
    const [yoghurtRow, mjolkDl] = await setPantryItemsIn(inv.db, [kyl(yoghurt, 2, "förp", "Lindahls"), kyl(mjolk, 5, "dl", "Arla")]);
    const yoghurtAdded = await age(inv.db, yoghurtRow.id, 5);
    const mjolkAdded = await age(inv.db, mjolkDl.id, 7);
    const operation = randomUUID();

    const applied = await applyPantryInventoryIn(inv.db, {
      siteId: null,
      place: "Kyl",
      items: [kyl(mjolk, 1, "förp")],
      replaceRowIds: [mjolkDl.id],
      removeRowIds: [yoghurtRow.id],
      operationId: operation,
    });
    expect(applied).toMatchObject({ replaced: 1, removedCount: 1 });
    // "Ändrat" in another unit: the new row is the same milk, added when it was.
    const [mjolkForp] = await rowsFor(inv.db, mjolk);
    expect(mjolkForp).toMatchObject({ amount: 1, unit: "förp", label: "Arla" });
    sameTime(mjolkForp.created_at, mjolkAdded);
    expect(applied.set[0]).toMatchObject({ id: mjolkForp.id, label: "Arla" });

    await restorePantryRemovalIn(inv.db, operation);
    const stored = (await rowOf(inv.db, yoghurtRow.id))!;
    expect(stored).toMatchObject({ amount: 2, label: "Lindahls" });
    sameTime(stored.created_at, yoghurtAdded);
  });

  it("sets an inventory item's label through set_pantry_items", async () => {
    const inv = await createTestUser("pantry-label-inventory-set");
    const mjolk = await addIngredient(inv.db, uniqueName("Mjölk"));
    await applyPantryInventoryIn(inv.db, {
      siteId: null,
      place: "Kyl",
      items: [kyl(mjolk, 1, "förp", "Arla Mellanmjölk laktosfri 1,5 l")],
      replaceRowIds: [],
      removeRowIds: [],
      operationId: null,
    });
    expect(await rowsFor(inv.db, mjolk)).toEqual([expect.objectContaining({ label: "Arla Mellanmjölk laktosfri 1,5 l" })]);
  });
});

describe("RLS on the label", () => {
  it("never lets another user or an anonymous client read or change a row's label", async () => {
    const other = await createTestUser("pantry-label-other");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const [row] = await setPantryItemsIn(user.db, [kyl(mjolk, 1, "l", "Arla")]);

    for (const db of [other.db, anonClient()]) {
      const read = await db.from("pantry_item").select("label").eq("id", row.id);
      expect(read.error?.code === "42501" || read.data?.length === 0).toBe(true);
      const changed = await db.from("pantry_item").update({ label: "Garant" }).eq("id", row.id).select("id");
      expect(changed.error?.code === "42501" || changed.data?.length === 0).toBe(true);
    }
    // Restoring a row with that id as another user is refused, and the label stays.
    const { error } = await other.db.rpc("restore_pantry_item", {
      item: { id: row.id, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l", label: "Garant" },
    });
    expect(error).not.toBeNull();
    expect(await rowOf(user.db, row.id)).toMatchObject({ label: "Arla" });
  });
});

import { describe, expect, it, vi } from "vitest";
import { addToPantryIn, findPantryAdditionsIn, forgetPantryAdditionsIn } from "./add";
import { PantryDataError, type PantryDb } from "./client";

// addToPantryIn and findPantryAdditionsIn with a fake client: what is sent to
// add_to_pantry and read from pantry_addition. The database itself is tested
// in tests/integration/pantry.test.ts.

const kaffe = "11111111-1111-4111-8111-111111111111";
const gradde = "22222222-2222-4222-8222-222222222222";
const key1 = "33333333-3333-4333-8333-333333333333";
const key2 = "44444444-4444-4444-8444-444444444444";

function fakeRpc(answer: { data: unknown; error: { code: string } | null }) {
  const rpc = vi.fn(async () => answer);
  return { db: { rpc } as unknown as PantryDb, rpc };
}

describe("addToPantryIn", () => {
  it("sends the items in order, with the catalog's location for those without one, and returns the count", async () => {
    const { db, rpc } = fakeRpc({ data: 2, error: null });
    const locations = vi.fn(async () => ({
      [gradde]: { location: "Kyl" as const },
      [kaffe]: { location: "Kyl" as const },
    }));
    const added = await addToPantryIn(
      db,
      [
        { key: key1, ingredientId: gradde, amount: 3, unit: "dl" },
        { key: key2, ingredientId: kaffe, amount: null, unit: null, location: "Skafferi" },
      ],
      locations,
    );
    expect(added).toBe(2);
    // Every ingredient is looked up; a location given wins over the catalog's.
    expect(locations).toHaveBeenCalledWith([gradde, kaffe]);
    expect(rpc).toHaveBeenCalledWith("add_to_pantry", {
      items: [
        { key: key1, ingredient_id: gradde, location: "Kyl", amount: 3, unit: "dl" },
        { key: key2, ingredient_id: kaffe, location: "Skafferi", amount: null, unit: null },
      ],
    });
  });

  it("sends the place when one is given, and leaves it out for the selected place", async () => {
    const stugan = "55555555-5555-4555-8555-555555555555";
    const { db, rpc } = fakeRpc({ data: 1, error: null });
    const locations = async () => ({ [kaffe]: { location: "Skafferi" as const } });
    const item = { key: key1, ingredientId: kaffe, amount: 1, unit: "förp" as const };
    await addToPantryIn(db, [item], locations, stugan);
    await addToPantryIn(db, [item], locations, null);
    const row = { key: key1, ingredient_id: kaffe, location: "Skafferi", amount: 1, unit: "förp" };
    expect(rpc.mock.calls).toEqual([
      ["add_to_pantry", { items: [row], site: stugan }],
      ["add_to_pantry", { items: [row] }],
    ]);
  });

  it("refuses a place that is not a uuid, and gives site_gone for a place that is gone, MK410", async () => {
    const locations = async () => ({ [kaffe]: { location: "Skafferi" as const } });
    const item = { key: key1, ingredientId: kaffe, amount: 1, unit: "förp" as const };
    const refused = fakeRpc({ data: 1, error: null });
    await expect(addToPantryIn(refused.db, [item], locations, "Stugan")).rejects.toThrow(
      new PantryDataError("invalid_site"),
    );
    expect(refused.rpc).not.toHaveBeenCalled();
    const gone = fakeRpc({ data: null, error: { code: "MK410" } });
    await expect(
      addToPantryIn(gone.db, [item], locations, "55555555-5555-4555-8555-555555555555"),
    ).rejects.toThrow(new PantryDataError("site_gone"));
  });

  it("refuses an ingredient the catalog does not return, also with a location given", async () => {
    const { db, rpc } = fakeRpc({ data: 1, error: null });
    await expect(
      addToPantryIn(db, [{ key: key1, ingredientId: kaffe, amount: 1, unit: "förp", location: "Skafferi" }], async () => ({})),
    ).rejects.toThrow(new PantryDataError("unknown_ingredient"));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws before writing for invalid items, or an ingredient the catalog does not have", async () => {
    const { db, rpc } = fakeRpc({ data: 0, error: null });
    await expect(addToPantryIn(db, [], async () => ({}))).rejects.toThrow(new PantryDataError("invalid_items"));
    await expect(
      addToPantryIn(db, [{ key: key1, ingredientId: kaffe, amount: 2, unit: null }], async () => ({})),
    ).rejects.toThrow(new PantryDataError("invalid_items"));
    await expect(
      addToPantryIn(db, [{ key: key1, ingredientId: kaffe, amount: 2, unit: "st" }], async () => ({})),
    ).rejects.toThrow(new PantryDataError("unknown_ingredient"));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws when Postgres refuses", async () => {
    const { db } = fakeRpc({ data: null, error: { code: "23514" } });
    await expect(
      addToPantryIn(db, [{ key: key1, ingredientId: kaffe, amount: 2, unit: "st", location: "Kyl" }], async () => ({
        [kaffe]: { location: "Skafferi" as const },
      })),
    ).rejects.toThrow(new PantryDataError("add_failed 23514"));
  });
});

describe("findPantryAdditionsIn", () => {
  function fakeSelect(answer: (keys: string[]) => { data: { key: string }[] | null; error: { code: string } | null }) {
    const asked: string[][] = [];
    const query = {
      select: () => query,
      in: vi.fn(async (_column: string, keys: string[]) => {
        asked.push(keys);
        return answer(keys);
      }),
    };
    return { db: { from: () => query } as unknown as PantryDb, asked };
  }

  it("returns the keys with a receipt, asking once per key", async () => {
    const { db, asked } = fakeSelect(() => ({ data: [{ key: key2 }], error: null }));
    expect(await findPantryAdditionsIn(db, [key1, key2, key1])).toEqual([key2]);
    expect(asked).toEqual([[key1, key2]]);
  });

  it("asks nothing for no keys, and in chunks for many", async () => {
    const none = fakeSelect(() => ({ data: [], error: null }));
    expect(await findPantryAdditionsIn(none.db, [])).toEqual([]);
    expect(none.asked).toEqual([]);

    const many = fakeSelect(() => ({ data: [], error: null }));
    await findPantryAdditionsIn(
      many.db,
      Array.from({ length: 150 }, (_, index) => `key-${index}`),
    );
    expect(many.asked.map((keys) => keys.length)).toEqual([100, 50]);
  });

  it("throws when Postgres refuses", async () => {
    const { db } = fakeSelect(() => ({ data: null, error: { code: "08006" } }));
    await expect(findPantryAdditionsIn(db, [key1])).rejects.toThrow(new PantryDataError("find_additions_failed 08006"));
  });
});

describe("forgetPantryAdditionsIn", () => {
  function fakeDelete(error: { code: string } | null = null) {
    const asked: string[][] = [];
    const query = {
      delete: () => query,
      in: vi.fn(async (_column: string, keys: string[]) => {
        asked.push(keys);
        return { error };
      }),
    };
    return { db: { from: () => query } as unknown as PantryDb, asked };
  }

  it("deletes the receipts of the keys, once per key and in chunks, and nothing for no keys", async () => {
    const { db, asked } = fakeDelete();
    await forgetPantryAdditionsIn(db, [key1, key2, key1]);
    expect(asked).toEqual([[key1, key2]]);
    await forgetPantryAdditionsIn(db, Array.from({ length: 101 }, (_, index) => `key-${index}`));
    expect(asked.slice(1).map((keys) => keys.length)).toEqual([100, 1]);
    const none = fakeDelete();
    await forgetPantryAdditionsIn(none.db, []);
    expect(none.asked).toEqual([]);
  });

  it("throws when Postgres refuses", async () => {
    await expect(forgetPantryAdditionsIn(fakeDelete({ code: "08006" }).db, [key1])).rejects.toThrow(
      new PantryDataError("forget_additions_failed 08006"),
    );
  });
});

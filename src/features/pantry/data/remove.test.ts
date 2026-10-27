import { describe, expect, it, vi } from "vitest";
import { PantryDataError, type PantryDb } from "./client";
import { emptyPantryPlaceIn, removePantryItemIn, restorePantryItemIn, restorePantryRemovalIn } from "./remove";

// removePantryItemIn, emptyPantryPlaceIn and restorePantryRemovalIn with a fake client: what the delete gives back. The
// database itself is tested in tests/integration/pantry.test.ts.

const rowId = "22222222-2222-4222-8222-222222222222";
const mjolk = "11111111-1111-4111-8111-111111111111";

/** A client whose delete answers with `answer`, recording the filters. */
function fakeDb(answer: { data: unknown[] | null; error: { code: string } | null }) {
  const filters: [string, string][] = [];
  const query = {
    delete: () => query,
    eq: (column: string, value: string) => {
      filters.push([column, value]);
      return query;
    },
    select: vi.fn(async () => answer),
  };
  return { db: { from: () => query } as unknown as PantryDb, filters };
}

describe("removePantryItemIn", () => {
  it("returns the deleted row, deleting by id and user", async () => {
    const { db, filters } = fakeDb({
      data: [{ id: rowId, ingredient_id: mjolk, location: "Kyl", amount: "1.5", unit: "l" }],
      error: null,
    });
    expect(await removePantryItemIn(db, "user", rowId)).toEqual({
      row: { id: rowId, ingredientId: mjolk, location: "Kyl", amount: 1.5, unit: "l" },
    });
    expect(filters).toEqual([
      ["id", rowId],
      ["user_id", "user"],
    ]);
  });

  it("gives row null, without throwing, when the deleted row cannot be read back", async () => {
    // The row is gone already, so a throw would tell Pontus it is still there.
    const { db } = fakeDb({
      data: [{ id: rowId, ingredient_id: mjolk, location: "Garage", amount: 1, unit: "l" }],
      error: null,
    });
    expect(await removePantryItemIn(db, "user", rowId)).toEqual({ row: null });
  });

  it("gives null when nothing was deleted, and throws when Postgres refuses", async () => {
    expect(await removePantryItemIn(fakeDb({ data: [], error: null }).db, "user", rowId)).toBeNull();
    await expect(removePantryItemIn(fakeDb({ data: null, error: { code: "08006" } }).db, "user", rowId)).rejects.toThrow(
      new PantryDataError("remove_failed 08006"),
    );
  });
});

/** A client whose rpc answers with `answer`, recording the calls. */
function fakeRpc(answer: { data: unknown; error: { code: string } | null }) {
  const rpc = vi.fn(async () => answer);
  return { db: { rpc } as unknown as PantryDb, rpc };
}

const dbRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  ingredient_id: mjolk,
  location: "Kyl",
  amount: 2,
  unit: "förp",
  ...overrides,
});
const otherId = "33333333-3333-4333-8333-333333333333";
const operation = "44444444-4444-4444-8444-444444444444";
const stugan = "55555555-5555-4555-8555-555555555555";

describe("emptyPantryPlaceIn", () => {
  it("empties the location in one call under the operation id, and gives the count and ids", async () => {
    const { db, rpc } = fakeRpc({
      data: { removed: 2, items: [dbRow(rowId), dbRow(otherId, { amount: null, unit: null })] },
      error: null,
    });
    expect(await emptyPantryPlaceIn(db, "Kyl", operation, stugan)).toEqual({ removed: 2, removedIds: [rowId, otherId] });
    expect(rpc).toHaveBeenCalledWith("empty_pantry_place", { place: "Kyl", operation_id: operation, site: stugan });
  });

  it("counts a removed row the domain does not know, since the server keeps it for Ångra", async () => {
    const { db } = fakeRpc({ data: { removed: 2, items: [dbRow(rowId), dbRow(otherId, { unit: "kartong" })] }, error: null });
    expect(await emptyPantryPlaceIn(db, "Kyl", operation, stugan)).toEqual({ removed: 2, removedIds: [rowId, otherId] });
  });

  it("never throws once the delete has committed, also for an answer it cannot read", async () => {
    expect(await emptyPantryPlaceIn(fakeRpc({ data: { removed: 0, items: [] }, error: null }).db, "Frys", operation, null)).toEqual({
      removed: 0,
      removedIds: [],
    });
    expect(await emptyPantryPlaceIn(fakeRpc({ data: "?", error: null }).db, "Frys", operation, null)).toEqual({
      removed: 0,
      removedIds: [],
    });
  });

  it("refuses an unknown location or operation id before calling, and throws when Postgres refuses", async () => {
    const { db, rpc } = fakeRpc({ data: null, error: null });
    await expect(emptyPantryPlaceIn(db, "Garage" as never, operation, stugan)).rejects.toThrow(new PantryDataError("invalid_location"));
    await expect(emptyPantryPlaceIn(db, "Kyl", "op-1", stugan)).rejects.toThrow(new PantryDataError("invalid_operation"));
    expect(rpc).not.toHaveBeenCalled();
    await expect(emptyPantryPlaceIn(fakeRpc({ data: null, error: { code: "42501" } }).db, "Kyl", operation, null)).rejects.toThrow(
      new PantryDataError("empty_failed 42501"),
    );
  });
});

describe("emptyPantryPlaceIn on a place (Story 8.4)", () => {
  it("leaves `site` out for the selected place", async () => {
    const { db, rpc } = fakeRpc({ data: { removed: 0, items: [] }, error: null });
    await emptyPantryPlaceIn(db, "Kyl", operation, null);
    expect(rpc).toHaveBeenCalledWith("empty_pantry_place", { place: "Kyl", operation_id: operation });
  });

  it("refuses a place that is not a uuid before calling, and gives site_gone for MK410", async () => {
    const { db, rpc } = fakeRpc({ data: null, error: null });
    await expect(emptyPantryPlaceIn(db, "Kyl", operation, "stugan")).rejects.toThrow(new PantryDataError("invalid_site"));
    expect(rpc).not.toHaveBeenCalled();
    await expect(emptyPantryPlaceIn(fakeRpc({ data: null, error: { code: "MK410" } }).db, "Kyl", operation, stugan)).rejects.toThrow(
      new PantryDataError("site_gone"),
    );
    await expect(emptyPantryPlaceIn(fakeRpc({ data: null, error: { code: "MK409" } }).db, "Kyl", operation, stugan)).rejects.toThrow(
      new PantryDataError("empty_failed MK409"),
    );
  });
});

describe("restorePantryRemovalIn", () => {
  it("gives the restored rows with their own place (Story 8.4)", async () => {
    const { db } = fakeRpc({ data: { restored: [dbRow(rowId, { site_id: stugan })], skipped: 0 }, error: null });
    expect((await restorePantryRemovalIn(db, operation)).rows).toEqual([
      { id: rowId, siteId: stugan, ingredientId: mjolk, location: "Kyl", amount: 2, unit: "förp" },
    ]);
  });

  it("puts the operation's rows back in one call, and gives the ids, the known rows and the skipped count", async () => {
    const { db, rpc } = fakeRpc({
      data: { restored: [dbRow(rowId), dbRow(otherId, { unit: "kartong" })], skipped: 1 },
      error: null,
    });
    expect(await restorePantryRemovalIn(db, operation)).toEqual({
      restoredIds: [rowId, otherId],
      rows: [{ id: rowId, ingredientId: mjolk, location: "Kyl", amount: 2, unit: "förp" }],
      skipped: 1,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("restore_pantry_removal", { operation_id: operation });
  });

  it("refuses an operation id that is not a uuid before calling, and throws when Postgres refuses", async () => {
    const { db, rpc } = fakeRpc({ data: null, error: null });
    await expect(restorePantryRemovalIn(db, "op-1")).rejects.toThrow(new PantryDataError("invalid_operation"));
    expect(rpc).not.toHaveBeenCalled();
    await expect(restorePantryRemovalIn(fakeRpc({ data: null, error: { code: "P0002" } }).db, operation)).rejects.toThrow(
      new PantryDataError("restore_failed P0002"),
    );
  });
});

describe("the label and time on a removed and restored row (Story 11.2)", () => {
  const added = "2026-10-20T08:15:00.123456+00:00";

  it("reads them back from the delete, so Ångra can put them back", async () => {
    const select = vi.fn(async () => ({ data: [dbRow(rowId, { label: "Arla", created_at: added })], error: null }));
    const query = { delete: () => query, eq: () => query, select };
    const db = { from: () => query } as unknown as PantryDb;
    expect(await removePantryItemIn(db, "user", rowId)).toEqual({
      row: { id: rowId, ingredientId: mjolk, location: "Kyl", amount: 2, unit: "förp", label: "Arla", createdAt: added },
    });
    expect(select).toHaveBeenCalledWith("id, site_id, ingredient_id, location, amount, unit, label, created_at");
  });

  it("sends them to restore_pantry_item, and null and no time for a row without them", async () => {
    const { db, rpc } = fakeRpc({ data: dbRow(rowId, { site_id: stugan, label: "Arla", created_at: added }), error: null });
    const row = { id: rowId, siteId: stugan, ingredientId: mjolk, location: "Kyl", amount: 2, unit: "förp" } as const;
    expect(await restorePantryItemIn(db, { ...row, label: "Arla", createdAt: added })).toEqual({
      ...row,
      label: "Arla",
      createdAt: added,
    });
    expect(rpc).toHaveBeenLastCalledWith("restore_pantry_item", {
      item: { id: rowId, site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "förp", label: "Arla", created_at: added },
      site: stugan,
    });

    await restorePantryItemIn(db, row);
    expect(rpc).toHaveBeenLastCalledWith("restore_pantry_item", {
      item: { id: rowId, site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "förp", label: null },
      site: stugan,
    });
  });

  it("refuses a time that is not one before calling", async () => {
    const { db, rpc } = fakeRpc({ data: null, error: null });
    const row = { id: rowId, ingredientId: mjolk, location: "Kyl", amount: 2, unit: "förp", createdAt: "igår" } as const;
    await expect(restorePantryItemIn(db, row)).rejects.toThrow(new PantryDataError("invalid_row"));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("gives the rows a removal put back with their labels and times", async () => {
    const { db } = fakeRpc({
      data: {
        restored: [dbRow(rowId, { label: "Arla", created_at: added }), dbRow(otherId, { label: null, created_at: added })],
        skipped: 0,
      },
      error: null,
    });
    expect((await restorePantryRemovalIn(db, operation)).rows).toEqual([
      { id: rowId, ingredientId: mjolk, location: "Kyl", amount: 2, unit: "förp", label: "Arla", createdAt: added },
      { id: otherId, ingredientId: mjolk, location: "Kyl", amount: 2, unit: "förp", label: null, createdAt: added },
    ]);
  });
});

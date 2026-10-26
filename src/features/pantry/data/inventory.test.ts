import { describe, expect, it, vi } from "vitest";
import { PantryDataError, type PantryDb } from "./client";
import { applyPantryInventoryIn, type ApplyInventoryRequest } from "./inventory";

// applyPantryInventoryIn with a fake client: what it sends and how it reads
// the answer. The database itself is tested in tests/integration/pantry.test.ts.

const mjolk = "11111111-1111-4111-8111-111111111111";
const yoghurt = "11111111-1111-4111-8111-111111111112";
const rowId = "22222222-2222-4222-8222-222222222222";
const otherRowId = "22222222-2222-4222-8222-222222222223";
const operation = "33333333-3333-4333-8333-333333333333";
const stugan = "55555555-5555-4555-8555-555555555555";

function fakeRpc(answer: { data: unknown; error: { code: string } | null }) {
  const rpc = vi.fn(async () => answer);
  return { db: { rpc } as unknown as PantryDb, rpc };
}

const request: ApplyInventoryRequest = {
  place: "Kyl",
  items: [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "förp" }],
  replaceRowIds: [otherRowId],
  removeRowIds: [rowId],
  operationId: operation,
  siteId: stugan,
};

describe("applyPantryInventoryIn", () => {
  it("sends the place, the items, the ids and the operation, and reads the rows set and removed", async () => {
    const { db, rpc } = fakeRpc({
      data: {
        set: [{ id: otherRowId, site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: "1", unit: "förp" }],
        removed: [{ id: rowId, site_id: stugan, ingredient_id: yoghurt, location: "Kyl", amount: 2, unit: "förp" }],
        replaced: 1,
        undoable: 1,
      },
      error: null,
    });
    expect(await applyPantryInventoryIn(db, request)).toEqual({
      set: [{ id: otherRowId, siteId: stugan, ingredientId: mjolk, location: "Kyl", amount: 1, unit: "förp" }],
      removed: [{ id: rowId, siteId: stugan, ingredientId: yoghurt, location: "Kyl", amount: 2, unit: "förp" }],
      removedCount: 1,
      replaced: 1,
      undoable: 1,
      unreadable: false,
    });
    expect(rpc).toHaveBeenCalledWith("apply_pantry_inventory", {
      place: "Kyl",
      items: [{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "förp" }],
      replace_ids: [otherRowId],
      remove_ids: [rowId],
      operation_id: operation,
      site: stugan,
    });
  });

  it("leaves the operation out without removals, and counts a removed row it cannot read without throwing", async () => {
    const { db, rpc } = fakeRpc({
      data: {
        set: [],
        removed: [{ id: rowId, ingredient_id: yoghurt, location: "Garage", amount: 2, unit: "förp" }, { broken: true }],
        replaced: 0,
        undoable: 2,
      },
      error: null,
    });
    const result = await applyPantryInventoryIn(db, { ...request, items: [], replaceRowIds: [], operationId: operation });
    expect(result).toEqual({ set: [], removed: [], removedCount: 2, replaced: 0, undoable: 2, unreadable: false });

    const onlySet = fakeRpc({ data: { set: [], removed: [], replaced: 0, undoable: 0 }, error: null });
    await applyPantryInventoryIn(onlySet.db, { ...request, removeRowIds: [], operationId: null });
    expect(onlySet.rpc.mock.calls[0]).not.toHaveProperty("1.operation_id");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["nothing to do", { ...request, items: [], removeRowIds: [] }],
    ["removals without an operation", { ...request, operationId: null }],
    ["an id that is not a uuid", { ...request, removeRowIds: ["yoghurt"] }],
    ["an unknown place", { ...request, place: "Garage" as never }],
    ["more than 40 items", { ...request, items: Array.from({ length: 41 }, () => request.items[0]) }],
    ["more than 50 rows to replace", { ...request, replaceRowIds: Array.from({ length: 51 }, () => rowId) }],
    ["more than 1 000 rows to remove", { ...request, removeRowIds: Array.from({ length: 1001 }, () => rowId) }],
  ])("refuses %s before calling", async (_name, wrong) => {
    const { db, rpc } = fakeRpc({ data: null, error: null });
    await expect(applyPantryInventoryIn(db, wrong)).rejects.toThrow(new PantryDataError("invalid_items"));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never throws once the write has committed: an answer it cannot read is unreadable", async () => {
    expect(await applyPantryInventoryIn(fakeRpc({ data: null, error: null }).db, request)).toEqual({
      set: [],
      removed: [],
      removedCount: 0,
      replaced: 0,
      undoable: 0,
      unreadable: true,
    });
    const badRow = await applyPantryInventoryIn(
      fakeRpc({ data: { set: [{ id: otherRowId, location: "Garage" }], removed: [], replaced: 0, undoable: 0 }, error: null }).db,
      request,
    );
    expect(badRow).toMatchObject({ set: [], unreadable: true });
  });

  it("throws apply_failed with the code when Postgres refuses", async () => {
    await expect(applyPantryInventoryIn(fakeRpc({ data: null, error: { code: "23503" } }).db, request)).rejects.toThrow(
      new PantryDataError("apply_failed 23503"),
    );
  });

  it("throws site_gone for a place that is gone (MK410), and leaves `site` out for the selected place (Story 8.4)", async () => {
    await expect(applyPantryInventoryIn(fakeRpc({ data: null, error: { code: "MK410" } }).db, request)).rejects.toThrow(
      new PantryDataError("site_gone"),
    );
    const selected = fakeRpc({ data: { set: [], removed: [], replaced: 0, undoable: 0 }, error: null });
    await applyPantryInventoryIn(selected.db, { ...request, siteId: null });
    expect(selected.rpc.mock.calls[0]).not.toHaveProperty("1.site");
    const { db, rpc } = fakeRpc({ data: null, error: null });
    await expect(applyPantryInventoryIn(db, { ...request, siteId: "stugan" })).rejects.toThrow(new PantryDataError("invalid_items"));
    expect(rpc).not.toHaveBeenCalled();
  });
});

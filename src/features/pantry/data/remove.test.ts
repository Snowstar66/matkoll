import { describe, expect, it, vi } from "vitest";
import { PantryDataError, type PantryDb } from "./client";
import { removePantryItemIn } from "./remove";

// removePantryItemIn with a fake client: what the delete gives back. The
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

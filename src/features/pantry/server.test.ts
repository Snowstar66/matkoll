import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "./data/client";

// addToPantry with the user check, the session client, the catalog and the
// data function stubbed: the Result it gives for each outcome.

const { CatalogDataError } = vi.hoisted(() => ({
  CatalogDataError: class extends Error {
    constructor(
      readonly code: string,
      readonly detail?: string,
    ) {
      super(code);
    }
  },
}));
const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const getIngredientDefaults = vi.fn();
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  getIngredientNames: vi.fn(),
  getIngredientDefaults: (ids: string[]) => getIngredientDefaults(ids),
}));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const addToPantryIn = vi.fn();
vi.mock("./data/add", () => ({
  addToPantryIn: (...args: unknown[]) => addToPantryIn(...args),
  findPantryAdditionsIn: vi.fn(),
  forgetPantryAdditionsIn: vi.fn(),
}));

const { addToPantry } = await import("./server");

const item = {
  key: "33333333-3333-4333-8333-333333333333",
  ingredientId: "11111111-1111-4111-8111-111111111111",
  amount: 3,
  unit: "dl" as const,
};

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user" }));
  addToPantryIn.mockReset().mockResolvedValue(1);
  getIngredientDefaults.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("addToPantry", () => {
  it("adds the items with the session client and the catalog's locations", async () => {
    expect(await addToPantry([item])).toEqual(ok({ added: 1 }));
    expect(addToPantryIn).toHaveBeenCalledWith(db, [item], expect.any(Function));
    const locations = addToPantryIn.mock.calls[0]![2] as (ids: string[]) => unknown;
    getIngredientDefaults.mockResolvedValue({});
    await locations([item.ingredientId]);
    expect(getIngredientDefaults).toHaveBeenCalledWith([item.ingredientId]);
  });

  it("returns unauthorized without an allowed user, and validation for invalid items, without writing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await addToPantry([item])).toEqual(fail("unauthorized"));
    requireUser.mockResolvedValue(ok({ id: "user" }));
    expect(await addToPantry([])).toEqual(fail("validation"));
    expect(await addToPantry([{ ...item, unit: null }])).toEqual(fail("validation"));
    expect(addToPantryIn).not.toHaveBeenCalled();
  });

  it.each([
    [new PantryDataError("add_failed 23514"), { reason: "add_failed 23514" }],
    [new CatalogDataError("query_failed", "08006"), { reason: "catalog_query_failed", detail: "08006" }],
  ])("gives pantry_add_failed, logged, when %s", async (error, logged) => {
    addToPantryIn.mockRejectedValue(error);
    expect(await addToPantry([item])).toEqual(fail("pantry_add_failed"));
    expect(log).toHaveBeenCalledWith("pantry_add_failed", logged);
  });

  it("throws what it does not expect", async () => {
    addToPantryIn.mockRejectedValue(new Error("bug"));
    await expect(addToPantry([item])).rejects.toThrow("bug");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "./data/client";

// addToPantry with the user check, the session client, the catalog and the
// data function stubbed: the Result it gives for each outcome. And
// getPantryForStatus with the places and the pantry stubbed: the place is
// read once, then that place's pantry, and a failure in either gives neither.

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

const loadPantrySitesIn = vi.fn();
vi.mock("./data/sites", () => ({ loadPantrySitesIn: (...args: unknown[]) => loadPantrySitesIn(...args) }));
const loadPantrySnapshot = vi.fn();
vi.mock("./data/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./data/queries")>()),
  loadPantrySnapshot: (...args: unknown[]) => loadPantrySnapshot(...args),
}));

const { addToPantry, getPantryForStatus } = await import("./server");

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

const stugan = "55555555-5555-4555-8555-555555555555";

describe("addToPantry", () => {
  it("adds the items with the session client and the catalog's locations", async () => {
    expect(await addToPantry([item], null)).toEqual(ok({ added: 1 }));
    expect(addToPantryIn).toHaveBeenCalledWith(db, [item], expect.any(Function), null);
    const locations = addToPantryIn.mock.calls[0]![2] as (ids: string[]) => unknown;
    getIngredientDefaults.mockResolvedValue({});
    await locations([item.ingredientId]);
    expect(getIngredientDefaults).toHaveBeenCalledWith([item.ingredientId]);
  });

  it("adds the items to the place given", async () => {
    expect(await addToPantry([item], stugan)).toEqual(ok({ added: 1 }));
    expect(addToPantryIn).toHaveBeenCalledWith(db, [item], expect.any(Function), stugan);
  });

  it("returns unauthorized without an allowed user, and validation for invalid items or place, without writing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await addToPantry([item], null)).toEqual(fail("unauthorized"));
    requireUser.mockResolvedValue(ok({ id: "user" }));
    expect(await addToPantry([], null)).toEqual(fail("validation"));
    expect(await addToPantry([{ ...item, unit: null }], null)).toEqual(fail("validation"));
    expect(await addToPantry([item], "Stugan")).toEqual(fail("validation"));
    expect(addToPantryIn).not.toHaveBeenCalled();
  });

  it("gives pantry_site_gone, logged with its code only, for a place that is gone", async () => {
    addToPantryIn.mockRejectedValue(new PantryDataError("site_gone"));
    expect(await addToPantry([item], stugan)).toEqual(fail("pantry_site_gone"));
    expect(log).toHaveBeenCalledWith("pantry_site_gone", { reason: "MK410" });
  });

  it.each([
    [new PantryDataError("add_failed 23514"), { reason: "add_failed 23514" }],
    [new CatalogDataError("query_failed", "08006"), { reason: "catalog_query_failed", detail: "08006" }],
  ])("gives pantry_add_failed, logged, when %s", async (error, logged) => {
    addToPantryIn.mockRejectedValue(error);
    expect(await addToPantry([item], null)).toEqual(fail("pantry_add_failed"));
    expect(log).toHaveBeenCalledWith("pantry_add_failed", logged);
  });

  it("gives validation, not pantry_add_failed, for a place the data layer refuses as not a uuid", async () => {
    addToPantryIn.mockRejectedValue(new PantryDataError("invalid_site"));
    expect(await addToPantry([item], stugan)).toEqual(fail("validation"));
  });

  it("throws what it does not expect", async () => {
    addToPantryIn.mockRejectedValue(new Error("bug"));
    await expect(addToPantry([item], null)).rejects.toThrow("bug");
  });
});

describe("getPantryForStatus", () => {
  const hemma = { id: "44444444-4444-4444-8444-444444444444", name: "Hemma", isSelected: false };
  const stuganSite = { id: stugan, name: "Stugan", isSelected: true };
  const snapshot = new Map([["korv", { unlimited: false, amounts: [{ unit: "st", amount: 8 }] }]]);

  beforeEach(() => {
    loadPantrySitesIn.mockReset().mockResolvedValue([hemma, stuganSite]);
    loadPantrySnapshot.mockReset().mockResolvedValue(snapshot);
  });

  it("reads the selected place once, then the pantry of exactly that place", async () => {
    expect(await getPantryForStatus()).toEqual({ site: { id: stugan, name: "Stugan", siteCount: 2 }, snapshot });
    expect(loadPantrySitesIn).toHaveBeenCalledTimes(1);
    expect(loadPantrySnapshot).toHaveBeenCalledWith(db, stugan);
  });

  it("gives no place and an empty pantry to a user without places, reading no pantry", async () => {
    loadPantrySitesIn.mockResolvedValue([]);
    expect(await getPantryForStatus()).toEqual({ site: null, snapshot: new Map() });
    expect(loadPantrySnapshot).not.toHaveBeenCalled();
  });

  it("gives neither place nor pantry, logged, when the place cannot be read", async () => {
    loadPantrySitesIn.mockRejectedValue(new PantryDataError("sites_failed 08006"));
    expect(await getPantryForStatus()).toEqual({ site: null, snapshot: null });
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "sites_failed 08006" });
    expect(loadPantrySnapshot).not.toHaveBeenCalled();
  });

  it("gives neither place nor pantry, logged, when the pantry cannot be read", async () => {
    loadPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 08006"));
    expect(await getPantryForStatus()).toEqual({ site: null, snapshot: null });
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 08006" });
  });

  it("throws what it does not expect", async () => {
    loadPantrySnapshot.mockRejectedValue(new TypeError("bug"));
    await expect(getPantryForStatus()).rejects.toThrow("bug");
  });
});

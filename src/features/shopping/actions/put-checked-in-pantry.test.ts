import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { ShoppingDataError } from "../data/client";

// putCheckedInPantry with the user check, the session client, the flow and
// revalidation stubbed: the Result and the revalidation for each outcome. The
// flow itself is tested in data/put-in-pantry.test.ts.

const { PantryDataError, MealPlanDataError, RecipeDataError, CatalogDataError } = vi.hoisted(() => {
  class DataError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  }
  return {
    PantryDataError: class extends DataError {},
    MealPlanDataError: class extends DataError {},
    RecipeDataError: class extends DataError {},
    CatalogDataError: class extends Error {
      constructor(
        readonly code: string,
        readonly detail?: string,
      ) {
        super(code);
      }
    },
  };
});
const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const addToPantry = vi.fn();
const findPantryAdditions = vi.fn();
const forgetPantryAdditions = vi.fn();
const getPantrySnapshot = vi.fn();
const listPantrySites = vi.fn();
vi.mock("@/features/pantry/server", () => ({
  PantryDataError,
  addToPantry: (...args: unknown[]) => addToPantry(...args),
  findPantryAdditions: (keys: unknown) => findPantryAdditions(keys),
  forgetPantryAdditions: (keys: unknown) => forgetPantryAdditions(keys),
  getPantrySnapshot: (...args: unknown[]) => getPantrySnapshot(...args),
  listPantrySites: () => listPantrySites(),
}));
vi.mock("@/features/mealplan/server", () => ({ MealPlanDataError, getCurrentPlan: vi.fn() }));
vi.mock("@/features/recipes/server", () => ({ RecipeDataError, getRecipesByIds: vi.fn() }));
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  getIngredientNames: vi.fn(),
  getIngredientDefaults: vi.fn(),
}));
const listCheckRowsIn = vi.fn();
vi.mock("../data/checks", () => ({ listCheckRowsIn: (...args: unknown[]) => listCheckRowsIn(...args) }));
vi.mock("../data/custom-items", () => ({ listCustomItemsIn: vi.fn() }));
vi.mock("../data/overrides", () => ({ listOverridesIn: vi.fn() }));
const putInPantryWith = vi.fn();
const clearPutInPantryIn = vi.fn();
vi.mock("../data/put-in-pantry", () => ({
  putInPantryWith: (...args: unknown[]) => putInPantryWith(...args),
  clearPutInPantryIn: (...args: unknown[]) => clearPutInPantryIn(...args),
}));

const { putCheckedInPantry } = await import("./put-checked-in-pantry");

const planId = "33333333-3333-4333-8333-333333333333";
const hemma = { id: "44444444-4444-4444-8444-444444444444", name: "Hemma", isSelected: true };
const stugan = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", isSelected: false };
/** The list counted against Stugan, while Hemma is selected (elsewhere, say). */
const input = { planId, siteId: stugan.id };
const allTables = ["pantry_item", "shopping_check", "shopping_custom_item", "shopping_line_override"];

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  putInPantryWith.mockReset().mockResolvedValue({ kind: "done", added: 3, removed: 1, skipped: 0, pantryWritten: true });
  forgetPantryAdditions.mockReset();
  getPantrySnapshot.mockReset();
  addToPantry.mockReset();
  listPantrySites.mockReset().mockResolvedValue([hemma, stugan]);
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("putCheckedInPantry", () => {
  it("runs the flow for the plan, says how many and where, and revalidates the pantry and the list", async () => {
    expect(await putCheckedInPantry(input)).toEqual(ok({ added: 3, removed: 1, skipped: 0, siteName: "Stugan" }));
    expect(putInPantryWith).toHaveBeenCalledWith(expect.any(Object), planId);
    expect(revalidateFor.mock.calls.map(([table]) => table)).toEqual(allTables);
  });

  it("counts the list against the list's place and puts the items there, not on the place selected now", async () => {
    await putCheckedInPantry(input);
    const deps = putInPantryWith.mock.calls[0]![0] as {
      sources: { pantry: () => unknown };
      addToPantry: (items: unknown) => unknown;
    };
    await deps.sources.pantry();
    expect(getPantrySnapshot).toHaveBeenCalledWith(stugan.id);
    await deps.addToPantry(["item"]);
    expect(addToPantry).toHaveBeenCalledWith(["item"], stugan.id);
  });

  it("uses the selected place for a list read without one", async () => {
    expect(await putCheckedInPantry({ planId, siteId: null })).toEqual(
      ok({ added: 3, removed: 1, skipped: 0, siteName: "Hemma" }),
    );
    const deps = putInPantryWith.mock.calls[0]![0] as {
      sources: { pantry: () => unknown };
      addToPantry: (items: unknown) => unknown;
    };
    await deps.sources.pantry();
    expect(getPantrySnapshot).toHaveBeenCalledWith(undefined);
    await deps.addToPantry(["item"]);
    expect(addToPantry).toHaveBeenCalledWith(["item"], null);
  });

  it("names no place with one, when nothing was added, or when the places cannot be read", async () => {
    listPantrySites.mockResolvedValue([hemma]);
    expect(await putCheckedInPantry({ planId, siteId: hemma.id })).toEqual(
      ok({ added: 3, removed: 1, skipped: 0, siteName: null }),
    );
    listPantrySites.mockResolvedValue([hemma, stugan]);
    putInPantryWith.mockResolvedValue({ kind: "done", added: 0, removed: 1, skipped: 0, pantryWritten: false });
    expect(await putCheckedInPantry(input)).toEqual(ok({ added: 0, removed: 1, skipped: 0, siteName: null }));
    putInPantryWith.mockResolvedValue({ kind: "done", added: 3, removed: 0, skipped: 0, pantryWritten: true });
    listPantrySites.mockRejectedValue(new PantryDataError("sites_failed 08006"));
    expect(await putCheckedInPantry(input)).toEqual(ok({ added: 3, removed: 0, skipped: 0, siteName: null }));
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "sites_failed 08006" });
  });

  it("names the place as it is after the write, renamed meanwhile", async () => {
    listPantrySites.mockResolvedValue([hemma, { ...stugan, name: "Torpet" }]);
    expect(await putCheckedInPantry(input)).toEqual(ok({ added: 3, removed: 1, skipped: 0, siteName: "Torpet" }));
  });

  it("gives pantry_site_gone as it is, revalidating nothing, for a place removed meanwhile", async () => {
    putInPantryWith.mockResolvedValue({ kind: "pantry_failed", error: fail("pantry_site_gone").error });
    expect(await putCheckedInPantry(input)).toEqual(fail("pantry_site_gone"));
    expect(revalidateFor).not.toHaveBeenCalled();
    // Logged by the pantry, with its code; not again here.
    expect(log).not.toHaveBeenCalled();
  });

  it("gives the flow the session client's writes and the pantry's functions", async () => {
    await putCheckedInPantry(input);
    const deps = putInPantryWith.mock.calls[0]![0] as {
      checkRows: (id: string) => unknown;
      clear: (id: string, cleared: unknown) => unknown;
      addToPantry: (items: unknown) => unknown;
      findAdditions: (keys: unknown) => unknown;
      forgetAdditions: (keys: unknown) => Promise<void>;
    };
    await deps.checkRows(planId);
    expect(listCheckRowsIn).toHaveBeenCalledWith(db, planId);
    const cleared = { checkIds: ["c"], overrideKeys: ["k"], customItemIds: ["i"] };
    await deps.clear(planId, cleared);
    expect(clearPutInPantryIn).toHaveBeenCalledWith(db, planId, cleared);
    await deps.findAdditions(["k"]);
    expect(findPantryAdditions).toHaveBeenCalledWith(["k"]);
    await deps.forgetAdditions(["c"]);
    expect(forgetPantryAdditions).toHaveBeenCalledWith(["c"]);
    // A receipt that cannot be forgotten is logged and left for the 30-day pruning.
    forgetPantryAdditions.mockRejectedValueOnce(new PantryDataError("forget_additions_failed 08006"));
    await deps.forgetAdditions(["c"]);
    expect(log).toHaveBeenCalledWith("pantry_forget_failed", { reason: "forget_additions_failed 08006" });
    forgetPantryAdditions.mockRejectedValueOnce(new Error("bug"));
    await expect(deps.forgetAdditions(["c"])).rejects.toThrow("bug");
  });

  it("says what could not go to the pantry, logged", async () => {
    putInPantryWith.mockResolvedValue({ kind: "done", added: 2, removed: 0, skipped: 1, pantryWritten: true });
    expect(await putCheckedInPantry(input)).toEqual(ok({ added: 2, removed: 0, skipped: 1, siteName: "Stugan" }));
    expect(log).toHaveBeenCalledWith("shopping_put_in_pantry_skipped", { count: 1 });
  });

  it("revalidates the list but not the pantry when nothing went to the pantry", async () => {
    putInPantryWith.mockResolvedValue({ kind: "done", added: 0, removed: 1, skipped: 0, pantryWritten: false });
    expect(await putCheckedInPantry(input)).toEqual(ok({ added: 0, removed: 1, skipped: 0, siteName: null }));
    expect(revalidateFor.mock.calls.map(([table]) => table)).toEqual(allTables.slice(1));
  });

  it.each([
    [{ planId: "inte-ett-id", siteId: null }],
    [{ planId, siteId: "Stugan" }],
    [{ planId }],
    [{}],
    [undefined],
  ])("rejects %j without running", async (input) => {
    expect(await putCheckedInPantry(input as never)).toEqual(fail("validation"));
    expect(putInPantryWith).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await putCheckedInPantry(input)).toEqual(fail("unauthorized"));
    expect(putInPantryWith).not.toHaveBeenCalled();
  });

  it("gives shopping_plan_changed, or that the items are in the pantry when it was written, revalidating it then", async () => {
    putInPantryWith.mockResolvedValue({ kind: "plan_changed", pantryWritten: false });
    expect(await putCheckedInPantry(input)).toEqual(fail("shopping_plan_changed"));
    expect(revalidateFor.mock.calls.map(([table]) => table)).toEqual(["shopping_check"]);
    revalidateFor.mockReset();
    putInPantryWith.mockResolvedValue({ kind: "plan_changed", pantryWritten: true });
    expect(await putCheckedInPantry(input)).toEqual(fail("shopping_put_in_pantry_plan_changed"));
    expect(revalidateFor.mock.calls.map(([table]) => table)).toEqual(["pantry_item", "shopping_check"]);
  });

  it.each([
    [fail("pantry_add_failed").error, fail("pantry_add_failed")],
    [fail("validation").error, fail("pantry_add_failed")],
    [fail("unauthorized").error, fail("unauthorized")],
  ])("gives %j from the pantry as %j, revalidating nothing", async (error, expected) => {
    putInPantryWith.mockResolvedValue({ kind: "pantry_failed", error });
    expect(await putCheckedInPantry(input)).toEqual(expected);
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("gives shopping_put_in_pantry_failed, logged, when the list was not cleared, and revalidates the pantry", async () => {
    putInPantryWith.mockResolvedValue({ kind: "clear_failed", detail: "clear_failed 08006", pantryWritten: true });
    expect(await putCheckedInPantry(input)).toEqual(fail("shopping_put_in_pantry_failed"));
    expect(log).toHaveBeenCalledWith("shopping_put_in_pantry_failed", { reason: "clear_failed 08006" });
    expect(revalidateFor.mock.calls.map(([table]) => table)).toEqual(["pantry_item"]);
  });

  it.each([
    [new MealPlanDataError("plan_failed 08006"), { reason: "read_plan_failed 08006" }],
    [new RecipeDataError("recipes_failed"), { reason: "read_recipes_failed" }],
    [new PantryDataError("snapshot_failed"), { reason: "read_snapshot_failed" }],
    [new ShoppingDataError("list_checks_failed 08006"), { reason: "read_list_checks_failed 08006" }],
    [new CatalogDataError("query_failed", "08006"), { reason: "read_catalog_query_failed", detail: "08006" }],
  ])("gives pantry_add_failed, logged, when a read fails: %s", async (error, logged) => {
    putInPantryWith.mockRejectedValue(error);
    expect(await putCheckedInPantry(input)).toEqual(fail("pantry_add_failed"));
    expect(log).toHaveBeenCalledWith("pantry_add_failed", logged);
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("throws what it does not expect", async () => {
    putInPantryWith.mockRejectedValue(new Error("bug"));
    await expect(putCheckedInPantry(input)).rejects.toThrow("bug");
  });
});

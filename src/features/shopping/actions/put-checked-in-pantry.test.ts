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
vi.mock("@/features/pantry/server", () => ({
  PantryDataError,
  addToPantry: (items: unknown) => addToPantry(items),
  findPantryAdditions: (keys: unknown) => findPantryAdditions(keys),
  forgetPantryAdditions: (keys: unknown) => forgetPantryAdditions(keys),
  getPantrySnapshot: () => getPantrySnapshot(),
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
const allTables = ["pantry_item", "shopping_check", "shopping_custom_item", "shopping_line_override"];

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  putInPantryWith.mockReset().mockResolvedValue({ kind: "done", added: 3, removed: 1, skipped: 0, pantryWritten: true });
  forgetPantryAdditions.mockReset();
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("putCheckedInPantry", () => {
  it("runs the flow for the plan, says how many, and revalidates the pantry and the list", async () => {
    expect(await putCheckedInPantry({ planId })).toEqual(ok({ added: 3, removed: 1, skipped: 0 }));
    expect(putInPantryWith).toHaveBeenCalledWith(expect.any(Object), planId);
    expect(revalidateFor.mock.calls.map(([table]) => table)).toEqual(allTables);
  });

  it("gives the flow the session client's writes and the pantry's functions", async () => {
    await putCheckedInPantry({ planId });
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
    await deps.addToPantry(["item"]);
    expect(addToPantry).toHaveBeenCalledWith(["item"]);
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
    expect(await putCheckedInPantry({ planId })).toEqual(ok({ added: 2, removed: 0, skipped: 1 }));
    expect(log).toHaveBeenCalledWith("shopping_put_in_pantry_skipped", { count: 1 });
  });

  it("revalidates the list but not the pantry when nothing went to the pantry", async () => {
    putInPantryWith.mockResolvedValue({ kind: "done", added: 0, removed: 1, skipped: 0, pantryWritten: false });
    expect(await putCheckedInPantry({ planId })).toEqual(ok({ added: 0, removed: 1, skipped: 0 }));
    expect(revalidateFor.mock.calls.map(([table]) => table)).toEqual(allTables.slice(1));
  });

  it.each([[{ planId: "inte-ett-id" }], [{}], [undefined]])("rejects %j without running", async (input) => {
    expect(await putCheckedInPantry(input as never)).toEqual(fail("validation"));
    expect(putInPantryWith).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await putCheckedInPantry({ planId })).toEqual(fail("unauthorized"));
    expect(putInPantryWith).not.toHaveBeenCalled();
  });

  it("gives shopping_plan_changed, or that the items are in the pantry when it was written, revalidating it then", async () => {
    putInPantryWith.mockResolvedValue({ kind: "plan_changed", pantryWritten: false });
    expect(await putCheckedInPantry({ planId })).toEqual(fail("shopping_plan_changed"));
    expect(revalidateFor.mock.calls.map(([table]) => table)).toEqual(["shopping_check"]);
    revalidateFor.mockReset();
    putInPantryWith.mockResolvedValue({ kind: "plan_changed", pantryWritten: true });
    expect(await putCheckedInPantry({ planId })).toEqual(fail("shopping_put_in_pantry_plan_changed"));
    expect(revalidateFor.mock.calls.map(([table]) => table)).toEqual(["pantry_item", "shopping_check"]);
  });

  it.each([
    [fail("pantry_add_failed").error, fail("pantry_add_failed")],
    [fail("validation").error, fail("pantry_add_failed")],
    [fail("unauthorized").error, fail("unauthorized")],
  ])("gives %j from the pantry as %j, revalidating nothing", async (error, expected) => {
    putInPantryWith.mockResolvedValue({ kind: "pantry_failed", error });
    expect(await putCheckedInPantry({ planId })).toEqual(expected);
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("gives shopping_put_in_pantry_failed, logged, when the list was not cleared, and revalidates the pantry", async () => {
    putInPantryWith.mockResolvedValue({ kind: "clear_failed", detail: "clear_failed 08006", pantryWritten: true });
    expect(await putCheckedInPantry({ planId })).toEqual(fail("shopping_put_in_pantry_failed"));
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
    expect(await putCheckedInPantry({ planId })).toEqual(fail("pantry_add_failed"));
    expect(log).toHaveBeenCalledWith("pantry_add_failed", logged);
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("throws what it does not expect", async () => {
    putInPantryWith.mockRejectedValue(new Error("bug"));
    await expect(putCheckedInPantry({ planId })).rejects.toThrow("bug");
  });
});

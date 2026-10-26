import { beforeEach, describe, expect, it, vi } from "vitest";
import { toSnapshot } from "@/features/pantry";
import { fail, ok } from "@/lib/errors";
import { ShoppingDataError } from "./data/client";

// getShoppingList with the other modules' server entries stubbed: the list is
// counted from them, a pantry that cannot be read leaves nothing taken off,
// and any other source that fails gives shopping_unavailable.

const { CatalogDataError, MealPlanDataError, PantryDataError, RecipeDataError } = vi.hoisted(() => {
  class DataError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  }
  class CatalogDataError extends Error {
    constructor(
      readonly code: string,
      readonly detail?: string,
    ) {
      super(code);
    }
  }
  return {
    CatalogDataError,
    MealPlanDataError: class extends DataError {},
    PantryDataError: class extends DataError {},
    RecipeDataError: class extends DataError {},
  };
});
const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const getCurrentPlan = vi.fn();
vi.mock("@/features/mealplan/server", () => ({ MealPlanDataError, getCurrentPlan: () => getCurrentPlan() }));
const getRecipesByIds = vi.fn();
vi.mock("@/features/recipes/server", () => ({
  RecipeDataError,
  getRecipesByIds: (ids: string[]) => getRecipesByIds(ids),
}));
const getPantrySnapshot = vi.fn();
vi.mock("@/features/pantry/server", () => ({ PantryDataError, getPantrySnapshot: () => getPantrySnapshot() }));
const getIngredientNames = vi.fn();
const getIngredientDefaults = vi.fn();
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  getIngredientNames: (ids: string[]) => getIngredientNames(ids),
  getIngredientDefaults: (ids: string[]) => getIngredientDefaults(ids),
}));

const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const listChecksIn = vi.fn();
vi.mock("./data/checks", () => ({ listChecksIn: (...args: unknown[]) => listChecksIn(...args) }));
const listCustomItemsIn = vi.fn();
vi.mock("./data/custom-items", () => ({ listCustomItemsIn: (...args: unknown[]) => listCustomItemsIn(...args) }));

const { getShoppingList } = await import("./server");

const recipeId = "11111111-1111-4111-8111-111111111111";
const gradde = "22222222-2222-4222-8222-222222222222";
const plan = {
  id: "plan",
  name: "Vecka 44",
  recipes: [
    { id: "d1", recipeId, recipeTitle: "Krämig kycklinggryta", servings: 6, position: 0 },
    { id: "d2", recipeId: null, recipeTitle: "Borttaget", servings: 2, position: 1 },
  ],
};
const recipe = {
  id: recipeId,
  originalServings: 4,
  lines: [{ id: "l1", ingredientId: gradde, amount: 2, unit: "dl", isVague: false, originalText: "2 dl grädde" }],
};

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user" }));
  getCurrentPlan.mockReset().mockResolvedValue(plan);
  getRecipesByIds.mockReset().mockResolvedValue([recipe]);
  getPantrySnapshot.mockReset().mockResolvedValue(toSnapshot([{ ingredientId: gradde, amount: 1, unit: "dl" }]));
  getIngredientNames.mockReset().mockResolvedValue({ [gradde]: "Grädde" });
  getIngredientDefaults.mockReset().mockResolvedValue({ [gradde]: { section: "Mejeri", location: "Kyl", defaultUnit: "dl" } });
  listChecksIn.mockReset().mockResolvedValue([]);
  listCustomItemsIn.mockReset().mockResolvedValue([]);
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getShoppingList", () => {
  it("counts the list from the plan, its recipes, the pantry and the catalog", async () => {
    const result = await getShoppingList();
    expect(result).toEqual(
      ok({
        plan: {
          id: "plan",
          name: "Vecka 44",
          // The dish whose recipe is deleted is not counted.
          dishCount: 1,
          skippedCount: 1,
          dishTitles: { d1: "Krämig kycklinggryta", d2: "Borttaget" },
        },
        lines: [
          expect.objectContaining({ key: `r:${gradde}:dl`, label: "Grädde", amount: 2, unit: "dl", section: "Mejeri", origins: ["d1"] }),
        ],
        pantryUnavailable: false,
        checksUnavailable: false,
      }),
    );
    expect(getRecipesByIds).toHaveBeenCalledWith([recipeId]);
    expect(getIngredientNames).toHaveBeenCalledWith([gradde]);
  });

  it("marks the plan's checked lines, read with the session client", async () => {
    listChecksIn.mockResolvedValue([`r:${gradde}:dl`, "r:00000000-0000-4000-8000-000000000000:st"]);
    const result = await getShoppingList();
    expect(listChecksIn).toHaveBeenCalledWith(db, "plan");
    expect(result.ok && result.data.lines.map((line) => [line.key, line.checked])).toEqual([[`r:${gradde}:dl`, true]]);
  });

  it("gives no plan and no lines without a current plan, and reads no recipes and no pantry", async () => {
    getCurrentPlan.mockResolvedValue(null);
    getPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 08006"));
    expect(await getShoppingList()).toEqual(
      ok({ plan: null, lines: [], pantryUnavailable: false, checksUnavailable: false }),
    );
    expect(getRecipesByIds).not.toHaveBeenCalled();
    expect(getPantrySnapshot).not.toHaveBeenCalled();
    expect(listChecksIn).not.toHaveBeenCalled();
    expect(listCustomItemsIn).not.toHaveBeenCalled();
  });

  it("reads no pantry for a plan whose dishes all lost their recipe", async () => {
    getCurrentPlan.mockResolvedValue({ ...plan, recipes: [plan.recipes[1]] });
    const result = await getShoppingList();
    expect(result.ok && result.data.plan).toMatchObject({ dishCount: 0, skippedCount: 1 });
    expect(getPantrySnapshot).not.toHaveBeenCalled();
    // The checks are read for any plan (own items need no dish, Story 3.5).
    expect(listChecksIn).toHaveBeenCalledWith(db, "plan");
  });

  it("shows the list without checks, and says so, when the checks cannot be read", async () => {
    listChecksIn.mockRejectedValue(new ShoppingDataError("list_checks_failed 08006"));
    const result = await getShoppingList();
    expect(result.ok && result.data.checksUnavailable).toBe(true);
    expect(result.ok && result.data.lines.map((line) => [line.label, line.checked])).toEqual([["Grädde", false]]);
    expect(log).toHaveBeenCalledWith("shopping_checks_unavailable", { reason: "list_checks_failed 08006" });
  });

  it("adds the plan's own items, each under its ingredient's section or Övrigt, also without dishes", async () => {
    const kaffe = "33333333-3333-4333-8333-333333333333";
    const own = "44444444-4444-4444-8444-444444444444";
    const disk = "55555555-5555-4555-8555-555555555555";
    listCustomItemsIn.mockResolvedValue([
      { id: own, label: "Kaffe", ingredientId: kaffe, amount: null, unit: null },
      { id: disk, label: "diskmedel", ingredientId: null, amount: 2, unit: "förp" },
    ]);
    getIngredientDefaults.mockImplementation(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, { section: id === kaffe ? "Skafferi" : "Mejeri" }])),
    );
    listChecksIn.mockResolvedValue([`c:${disk}`]);
    const result = await getShoppingList();
    expect(listCustomItemsIn).toHaveBeenCalledWith(db, "plan");
    // The own item's ingredient gives its section; its name is Pontus's text.
    expect(getIngredientDefaults).toHaveBeenCalledWith([gradde, kaffe]);
    expect(getIngredientNames).toHaveBeenCalledWith([gradde]);
    expect(result.ok && result.data.lines.map((line) => [line.section, line.key, line.label, line.checked])).toEqual([
      ["Mejeri", `r:${gradde}:dl`, "Grädde", false],
      ["Skafferi", `c:${own}`, "Kaffe", false],
      ["Övrigt", `c:${disk}`, "diskmedel", true],
    ]);

    getCurrentPlan.mockResolvedValue({ ...plan, recipes: [] });
    getIngredientNames.mockClear();
    const only = await getShoppingList();
    expect(only.ok && only.data.lines.map((line) => line.label)).toEqual(["Kaffe", "diskmedel"]);
    expect(getIngredientNames).not.toHaveBeenCalled();
  });

  it("takes nothing off when the pantry cannot be read, and says so", async () => {
    getPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 08006"));
    const result = await getShoppingList();
    expect(result.ok && result.data.pantryUnavailable).toBe(true);
    expect(result.ok && result.data.lines.map((line) => line.amount)).toEqual([3]);
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 08006" });
  });

  it.each([
    ["the plan", () => getCurrentPlan.mockRejectedValue(new MealPlanDataError("query_failed 08006")), { reason: "query_failed 08006" }],
    ["the recipes", () => getRecipesByIds.mockRejectedValue(new RecipeDataError("query_failed 08006")), { reason: "query_failed 08006" }],
    [
      "the own items",
      () => listCustomItemsIn.mockRejectedValue(new ShoppingDataError("list_custom_items_failed 08006")),
      { reason: "list_custom_items_failed 08006" },
    ],
    [
      "the catalog",
      () => getIngredientDefaults.mockRejectedValue(new CatalogDataError("query_failed", "08006")),
      { reason: "query_failed", detail: "08006" },
    ],
  ])("gives shopping_unavailable when %s cannot be read", async (_, failing, logged) => {
    failing();
    expect(await getShoppingList()).toEqual(fail("shopping_unavailable"));
    expect(log).toHaveBeenCalledWith("shopping_unavailable", logged);
  });

  it("throws other errors, which are bugs", async () => {
    getRecipesByIds.mockRejectedValue(new TypeError("bug"));
    await expect(getShoppingList()).rejects.toThrow("bug");
  });

  it("reads nothing without a signed-in user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await getShoppingList()).toEqual(fail("unauthorized"));
    expect(getCurrentPlan).not.toHaveBeenCalled();
  });
});

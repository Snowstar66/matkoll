import { beforeEach, describe, expect, it, vi } from "vitest";
import { toSnapshot } from "@/features/pantry";

// getMealPlanView with the session client, the plan query, the recipes module
// and the pantry stubbed: each source that fails degrades on its own.

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
const getCurrentPlanIn = vi.fn();
vi.mock("./data/queries", () => ({ getCurrentPlanIn: () => getCurrentPlanIn() }));
const { PantryDataError, RecipeDataError } = vi.hoisted(() => {
  class DataError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  }
  return { PantryDataError: class extends DataError {}, RecipeDataError: class extends DataError {} };
});
const getPantrySnapshot = vi.fn();
vi.mock("@/features/pantry/server", () => ({ PantryDataError, getPantrySnapshot: () => getPantrySnapshot() }));
const getRecipesByIds = vi.fn();
vi.mock("@/features/recipes/server", () => ({
  RecipeDataError,
  getRecipesByIds: (ids: string[]) => getRecipesByIds(ids),
}));

const { getMealPlanView } = await import("./server");

const recipeId = "11111111-1111-4111-8111-111111111111";
const plan = {
  id: "plan",
  name: "Vecka 44",
  recipes: [{ id: "dish", recipeId, recipeTitle: "Pasta", servings: 4, position: 0 }],
};
const recipe = { id: recipeId, title: "Pasta", imageUrl: null, totalMinutes: 20, originalServings: 4, isFavorite: false, lines: [] };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  getCurrentPlanIn.mockReset().mockResolvedValue(plan);
  getPantrySnapshot.mockReset().mockResolvedValue(toSnapshot([]));
  getRecipesByIds.mockReset().mockResolvedValue([recipe]);
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getMealPlanView", () => {
  it("joins each dish with its recipe, and has the pantry for the status", async () => {
    const view = await getMealPlanView();
    expect(view.plan).toEqual({ id: "plan", name: "Vecka 44" });
    expect(view.dishes[0].recipe).toEqual({ imageUrl: null, totalMinutes: 20, originalServings: 4, lines: [] });
    expect(view.snapshot).toBeInstanceOf(Map);
  });

  it("gives snapshot null when the pantry cannot be read, and the dishes all the same", async () => {
    getPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 08006"));
    const view = await getMealPlanView();
    expect(view.snapshot).toBeNull();
    expect(view.dishes).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 08006" });
  });

  it("shows the dishes by their stored titles when the recipes cannot be read", async () => {
    getRecipesByIds.mockRejectedValue(new RecipeDataError("query_failed 08006"));
    const view = await getMealPlanView();
    expect(view.dishes).toEqual([{ ...plan.recipes[0], recipe: null }]);
    expect(log).toHaveBeenCalledWith("mealplan_recipes_unavailable", { reason: "query_failed 08006" });
  });

  it("has no plan and no dishes before the first dish is added", async () => {
    getCurrentPlanIn.mockResolvedValue(null);
    expect(await getMealPlanView()).toMatchObject({ plan: null, dishes: [] });
    expect(getRecipesByIds).not.toHaveBeenCalled();
  });
});

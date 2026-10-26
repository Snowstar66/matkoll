import { beforeEach, describe, expect, it, vi } from "vitest";
import { toSnapshot } from "@/features/pantry";

// getRecipeWithPantry with the session client, the recipe query and the
// pantry stubbed: a pantry that cannot be read never takes the recipe down.

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/features/catalog/server", () => ({ getIngredientNames: vi.fn() }));
vi.mock("./actions/import-recipe", () => ({ importRecipe: vi.fn() }));
vi.mock("./actions/search-recipes", () => ({ searchRecipes: vi.fn() }));
const getRecipeIn = vi.fn();
vi.mock("./data/queries", () => ({ getRecipe: (...args: unknown[]) => getRecipeIn(...args) }));
const { PantryDataError } = vi.hoisted(() => ({
  PantryDataError: class extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
}));
const getPantrySnapshot = vi.fn();
vi.mock("@/features/pantry/server", () => ({ PantryDataError, getPantrySnapshot: () => getPantrySnapshot() }));

const { getRecipeWithPantry } = await import("./server");

const id = "11111111-1111-4111-8111-111111111111";
const line = (ingredientId: string | null) => ({ id: `line-${ingredientId}`, ingredientId, amount: 1, unit: "dl", isVague: false });
const recipe = { id, title: "Pasta", servings: 4, lines: [line("gradde"), line(null)], steps: [] };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  getRecipeIn.mockReset().mockResolvedValue(recipe);
  getPantrySnapshot.mockReset().mockResolvedValue(toSnapshot([]));
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getRecipeWithPantry", () => {
  it("gives the recipe and the pantry, only for the recipe's own ingredients", async () => {
    getPantrySnapshot.mockResolvedValue(
      toSnapshot([
        { ingredientId: "gradde", amount: 2, unit: "dl" },
        { ingredientId: "mjol", amount: 1, unit: "kg" },
      ]),
    );
    const found = await getRecipeWithPantry(id);
    expect(found?.recipe).toBe(recipe);
    expect(found?.snapshot).toEqual(new Map([["gradde", { unlimited: false, amounts: [{ unit: "dl", amount: 2 }] }]]));
  });

  it("gives the recipe with snapshot null when the pantry cannot be read", async () => {
    getPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 08006"));
    const found = await getRecipeWithPantry(id);
    expect(found).toEqual({ recipe, snapshot: null });
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 08006" });
  });

  it("gives null for a recipe that is not found", async () => {
    getRecipeIn.mockResolvedValue(null);
    expect(await getRecipeWithPantry(id)).toBeNull();
  });

  it("gives null for an id that is not a uuid without reading the recipe or the pantry", async () => {
    expect(await getRecipeWithPantry("inte-ett-id")).toBeNull();
    expect(getRecipeIn).not.toHaveBeenCalled();
    expect(getPantrySnapshot).not.toHaveBeenCalled();
  });
});

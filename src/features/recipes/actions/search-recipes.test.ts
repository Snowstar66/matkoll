import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";

// searchRecipes with the user check, the session client, the catalog and the queries stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));

class CatalogDataError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const findIngredientIds = vi.fn();
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  findIngredientIds: (text: string) => findIngredientIds(text),
}));

const searchRecipesIn = vi.fn();
vi.mock("../data/queries", () => ({ searchRecipesIn: (...args: unknown[]) => searchRecipesIn(...args) }));

const { searchRecipes } = await import("./search-recipes");

const gryta = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Krämig kycklinggryta",
  imageUrl: null,
  totalMinutes: 35,
  originalServings: 4,
  isFavorite: true,
};

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  findIngredientIds.mockReset().mockResolvedValue(["lok-id"]);
  searchRecipesIn.mockReset().mockResolvedValue([gryta]);
});

describe("searchRecipes", () => {
  it("searches titles, lines and the catalog's ingredients with the normalised text", async () => {
    expect(await searchRecipes("  Gul   LÖK ")).toEqual(ok([gryta]));
    expect(findIngredientIds).toHaveBeenCalledWith("gul lök");
    expect(searchRecipesIn).toHaveBeenCalledWith(db, { text: "gul lök", ingredientIds: ["lok-id"] });
  });

  it("returns unauthorized without an allowed user, without searching", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await searchRecipes("gryta")).toEqual(fail("unauthorized"));
    expect(findIngredientIds).not.toHaveBeenCalled();
    expect(searchRecipesIn).not.toHaveBeenCalled();
  });

  it("rejects more than 100 characters and a value that is not text", async () => {
    expect(await searchRecipes("a".repeat(101))).toEqual(fail("validation"));
    expect(await searchRecipes(42 as unknown as string)).toEqual(fail("validation"));
    expect(searchRecipesIn).not.toHaveBeenCalled();
  });

  it("gives recipe_search_failed when the catalog or the recipes fail, and logs only a reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    findIngredientIds.mockRejectedValueOnce(new CatalogDataError("query_failed"));
    expect(await searchRecipes("lök")).toEqual({
      ok: false,
      error: { code: "recipe_search_failed", message: errorMessages.recipe_search_failed },
    });
    expect(log).toHaveBeenCalledWith("recipe_search_failed", { reason: "catalog_query_failed" });

    searchRecipesIn.mockRejectedValueOnce(new RecipeDataError("query_failed 08006"));
    expect(await searchRecipes("lök")).toEqual(fail("recipe_search_failed"));
    expect(log).toHaveBeenCalledWith("recipe_search_failed", { reason: "query_failed 08006" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    searchRecipesIn.mockRejectedValue(new TypeError("boom"));
    await expect(searchRecipes("lök")).rejects.toThrow("boom");
  });
});

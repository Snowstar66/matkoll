import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";

// searchRecipes with the user check, the session client, the catalog, the
// pantry and the queries stubbed.

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

const pantrySnapshotOrNull = vi.fn();
vi.mock("../data/pantry-snapshot", () => ({ pantrySnapshotOrNull: () => pantrySnapshotOrNull() }));

const searchRecipesIn = vi.fn();
vi.mock("../data/queries", () => ({ searchRecipesIn: (...args: unknown[]) => searchRecipesIn(...args) }));

const { searchRecipes } = await import("./search-recipes");

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Krämig kycklinggryta",
  imageUrl: null,
  totalMinutes: 35,
  originalServings: 4,
  isFavorite: true,
  lines: [
    { id: "line-1", ingredientId: "gradde-id", amount: 3, unit: "dl", isVague: false },
    { id: "line-2", ingredientId: "lok-id", amount: 1, unit: null, isVague: false },
  ],
};
/** The row as the library gets it: without lines, with N (the onion is missing). */
const gryta = {
  id: row.id,
  title: row.title,
  imageUrl: null,
  totalMinutes: 35,
  originalServings: 4,
  isFavorite: true,
  missingCount: 1,
};

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  findIngredientIds.mockReset().mockResolvedValue(["lok-id"]);
  searchRecipesIn.mockReset().mockResolvedValue([row]);
  // Enough cream; no onion.
  pantrySnapshotOrNull.mockReset().mockResolvedValue(new Map([["gradde-id", { unlimited: false, amounts: [{ unit: "dl", amount: 3 }] }]]));
});

describe("searchRecipes", () => {
  it("searches titles, lines and the catalog's ingredients with the normalised text, and gives each recipe its status", async () => {
    expect(await searchRecipes("  Gul   LÖK ")).toEqual(ok([gryta]));
    expect(findIngredientIds).toHaveBeenCalledWith("gul lök");
    expect(searchRecipesIn).toHaveBeenCalledWith(db, { text: "gul lök", ingredientIds: ["lok-id"] });
  });

  it("returns unauthorized without an allowed user, without searching", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await searchRecipes("gryta")).toEqual(fail("unauthorized"));
    expect(findIngredientIds).not.toHaveBeenCalled();
    expect(searchRecipesIn).not.toHaveBeenCalled();
    expect(pantrySnapshotOrNull).not.toHaveBeenCalled();
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

  it("gives the recipes without status when the pantry cannot be read, never recipe_search_failed", async () => {
    pantrySnapshotOrNull.mockResolvedValue(null);
    expect(await searchRecipes("gryta")).toEqual(ok([{ ...gryta, missingCount: null }]));
  });

  it("does not read the pantry when nothing is found", async () => {
    searchRecipesIn.mockResolvedValue([]);
    expect(await searchRecipes("xyz")).toEqual(ok([]));
    expect(pantrySnapshotOrNull).not.toHaveBeenCalled();
  });

  it("throws other errors, which are bugs", async () => {
    searchRecipesIn.mockRejectedValue(new TypeError("boom"));
    await expect(searchRecipes("lök")).rejects.toThrow("boom");
    searchRecipesIn.mockResolvedValue([row]);
    pantrySnapshotOrNull.mockRejectedValue(new TypeError("pantry bug"));
    await expect(searchRecipes("lök")).rejects.toThrow("pantry bug");
  });
});

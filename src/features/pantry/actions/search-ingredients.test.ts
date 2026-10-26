import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogDataError } from "@/features/catalog/server";
import { fail, ok } from "@/lib/errors";

// searchPantryIngredients with the user check and the catalog stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const searchIngredients = vi.fn();
const getIngredientDefaults = vi.fn();
const matchIngredients = vi.fn();
vi.mock("@/features/catalog/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/server")>()),
  searchIngredients: (query: string) => searchIngredients(query),
  getIngredientDefaults: (ids: string[]) => getIngredientDefaults(ids),
  matchIngredients: (items: unknown) => matchIngredients(items),
}));

const { searchPantryIngredients } = await import("./search-ingredients");

const gulLok = { section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" } as const;

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  searchIngredients.mockReset().mockResolvedValue(ok([{ id: "1", name: "Gul lök" }, { id: "2", name: "Rödlök" }]));
  getIngredientDefaults.mockReset().mockResolvedValue({ "1": gulLok });
  matchIngredients.mockReset().mockResolvedValue([{ kind: "unmatched" }]);
});

describe("searchPantryIngredients", () => {
  it("gives each hit the catalog's location, section and unit", async () => {
    expect(await searchPantryIngredients("lök")).toEqual(
      ok([
        { id: "1", name: "Gul lök", defaults: gulLok, exact: false },
        { id: "2", name: "Rödlök", defaults: null, exact: false },
      ]),
    );
    expect(searchIngredients).toHaveBeenCalledWith("lök");
    expect(getIngredientDefaults).toHaveBeenCalledWith(["1", "2"]);
  });

  it("marks the hit whose name or synonym is the typed text", async () => {
    matchIngredients.mockResolvedValue([{ kind: "match", ingredientId: "2", confidence: "synonym" }]);
    const result = await searchPantryIngredients("  röd   lök ");
    expect(matchIngredients).toHaveBeenCalledWith([{ text: "röd lök" }]);
    expect(result.ok && result.data.map((hit) => hit.exact)).toEqual([false, true]);
  });

  it("reads no defaults without hits", async () => {
    searchIngredients.mockResolvedValue(ok([]));
    expect(await searchPantryIngredients("xyz")).toEqual(ok([]));
    expect(getIngredientDefaults).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await searchPantryIngredients("lök")).toEqual(fail("unauthorized"));
    expect(searchIngredients).not.toHaveBeenCalled();
  });

  it("passes on the search's failure", async () => {
    searchIngredients.mockResolvedValue(fail("validation"));
    expect(await searchPantryIngredients("a".repeat(101))).toEqual(fail("validation"));
  });

  it("gives catalog_unavailable when the defaults cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getIngredientDefaults.mockRejectedValue(new CatalogDataError("query_failed", "57014"));
    expect(await searchPantryIngredients("lök")).toEqual(fail("catalog_unavailable"));
    expect(log).toHaveBeenCalledWith("catalog_unavailable", { reason: "query_failed", detail: "57014" });
    log.mockRestore();
  });
});

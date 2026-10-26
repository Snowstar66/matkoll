import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok } from "@/lib/errors";
import { CatalogDataError } from "../data/client";

// searchIngredients with the user check, the session client and the query stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
const searchCatalog = vi.fn();
vi.mock("../data/queries", () => ({ searchCatalog: (db: unknown, text: string) => searchCatalog(db, text) }));

const { searchIngredients } = await import("./search-ingredients");

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  searchCatalog.mockReset().mockResolvedValue([{ id: "1", name: "Gul lök" }]);
});

describe("searchIngredients", () => {
  it("searches with the lower-case text", async () => {
    expect(await searchIngredients("  Gul LÖK ")).toEqual(ok([{ id: "1", name: "Gul lök" }]));
    expect(searchCatalog).toHaveBeenCalledWith({}, "gul lök");
  });

  it("returns unauthorized without an allowed user, without searching", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await searchIngredients("lök")).toEqual(fail("unauthorized"));
    expect(searchCatalog).not.toHaveBeenCalled();
  });

  it("rejects more than 100 characters", async () => {
    expect(await searchIngredients("a".repeat(101))).toEqual(fail("validation"));
    expect(searchCatalog).not.toHaveBeenCalled();
  });

  it("rejects a value that is not text", async () => {
    expect(await searchIngredients(42 as unknown as string)).toEqual(fail("validation"));
  });

  it("gives no hits for empty text without searching", async () => {
    expect(await searchIngredients("   ")).toEqual(ok([]));
    expect(searchCatalog).not.toHaveBeenCalled();
  });

  it("gives catalog_unavailable when the query fails, and logs only the code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    searchCatalog.mockRejectedValue(new CatalogDataError("query_failed", "08006"));
    expect(await searchIngredients("lök")).toEqual({
      ok: false,
      error: { code: "catalog_unavailable", message: errorMessages.catalog_unavailable },
    });
    expect(log).toHaveBeenCalledWith("catalog_unavailable", { reason: "query_failed" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    searchCatalog.mockRejectedValue(new TypeError("boom"));
    await expect(searchIngredients("lök")).rejects.toThrow("boom");
  });
});

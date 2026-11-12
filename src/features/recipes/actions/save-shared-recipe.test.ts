import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";
import type { SharedRecipe } from "../domain/shared-recipe";

// saveSharedRecipe with the user check, the session client, the catalog, the shared-recipe data
// functions and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const matchIngredients = vi.fn();
const commitIngredients = vi.fn();
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError: class CatalogDataError extends Error {
    code = "query_failed";
  },
  matchIngredients: (...args: unknown[]) => matchIngredients(...args),
  commitIngredients: (...args: unknown[]) => commitIngredients(...args),
}));
const getSharedIn = vi.fn();
const saveSharedIn = vi.fn();
const copyLinesIn = vi.fn();
vi.mock("../data/shared", () => ({
  getSharedIn: (...args: unknown[]) => getSharedIn(...args),
  saveSharedIn: (...args: unknown[]) => saveSharedIn(...args),
  copyLinesIn: (...args: unknown[]) => copyLinesIn(...args),
}));

const storeRecipeImage = vi.fn();
vi.mock("./store-recipe-image", () => ({ storeRecipeImage: (...args: unknown[]) => storeRecipeImage(...args) }));

const { saveSharedRecipe } = await import("./save-shared-recipe");

const id = "11111111-1111-4111-8111-111111111111";
const copyId = "99999999-9999-4999-8999-999999999999";
const chicken = "22222222-2222-4222-8222-222222222222";

const shared: SharedRecipe = {
  id,
  title: "Caesarkyckling",
  servings: 4,
  totalMinutes: 45,
  imageUrl: null,
  sourceKind: "text",
  sourceUrl: null,
  householdName: "Lindqvists",
  savedCopyId: null,
  version: "v1",
  steps: [],
  lines: [
    { originalText: "600 g kycklingfilé", amount: 600, unit: "g", isVague: false, group: null, stepIndex: null, ingredientName: "Kycklingfilé", ingredientSection: "Kött och fisk", isStapleMarked: false },
    { originalText: "salt", amount: null, unit: null, isVague: true, group: null, stepIndex: null, ingredientName: null, ingredientSection: null, isStapleMarked: false },
  ],
};

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  revalidateFor.mockReset();
  getSharedIn.mockReset().mockResolvedValue(shared);
  matchIngredients.mockReset().mockResolvedValue([{ kind: "match", ingredientId: chicken, confidence: "exact" }, { kind: "unmatched" }]);
  commitIngredients.mockReset().mockResolvedValue([chicken, null]);
  saveSharedIn.mockReset().mockResolvedValue({ id: copyId });
  copyLinesIn.mockReset();
  storeRecipeImage.mockReset().mockResolvedValue("stored");
});

describe("saveSharedRecipe", () => {
  it("matches the lines to the household's catalog by name, saves the copy with the version read, and revalidates", async () => {
    expect(await saveSharedRecipe(id, "v1")).toEqual(ok({ id: copyId, ingredientIds: [chicken, null] }));
    expect(matchIngredients).toHaveBeenCalledWith([
      { text: "Kycklingfilé", hint: { name: "Kycklingfilé", section: "Kött och fisk", location: "", defaultUnit: "" } },
      { text: "" },
    ]);
    expect(saveSharedIn).toHaveBeenCalledWith(db, id, [chicken, null], "v1");
    expect(revalidateFor).toHaveBeenCalledWith("recipe");
  });

  it("gives the new copy its own picture in the household's own storage, never read from the other household", async () => {
    expect(await saveSharedRecipe(id, "v1")).toEqual(ok({ id: copyId, ingredientIds: [chicken, null] }));
    expect(storeRecipeImage).toHaveBeenCalledTimes(1);
    expect(storeRecipeImage).toHaveBeenCalledWith(db, copyId);
  });

  it("saves the copy even when its picture cannot be kept", async () => {
    storeRecipeImage.mockResolvedValue("failed");
    expect(await saveSharedRecipe(id, "v1")).toEqual(ok({ id: copyId, ingredientIds: [chicken, null] }));
    storeRecipeImage.mockResolvedValue("cap");
    expect(await saveSharedRecipe(id, "v1")).toEqual(ok({ id: copyId, ingredientIds: [chicken, null] }));
  });

  it("does not make a picture for a recipe that is gone or changed", async () => {
    saveSharedIn.mockResolvedValue("gone");
    await saveSharedRecipe(id, "v1");
    saveSharedIn.mockResolvedValue("changed");
    await saveSharedRecipe(id, "v1");
    expect(storeRecipeImage).not.toHaveBeenCalled();
  });

  it("gives a copy saved before with its own lines' ingredients, and writes nothing", async () => {
    getSharedIn.mockResolvedValue({ ...shared, savedCopyId: copyId });
    copyLinesIn.mockResolvedValue([
      { originalText: "salt", ingredientId: null },
      { originalText: "600 g kycklingfilé", ingredientId: "c-1" },
    ]);
    expect(await saveSharedRecipe(id, "v1")).toEqual(ok({ id: copyId, ingredientIds: ["c-1", null] }));
    expect(copyLinesIn).toHaveBeenCalledWith(db, copyId);
    expect(matchIngredients).not.toHaveBeenCalled();
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(saveSharedIn).not.toHaveBeenCalled();
    // A copy from before the pictures were kept gets its own picture now (nothing is done when it has one).
    expect(storeRecipeImage).toHaveBeenCalledWith(db, copyId);
  });

  it("says the recipe is gone when it is no longer shared, read or saved", async () => {
    getSharedIn.mockResolvedValue(null);
    expect(await saveSharedRecipe(id)).toEqual(fail("recipe_shared_gone"));
    expect(commitIngredients).not.toHaveBeenCalled();
    getSharedIn.mockResolvedValue(shared);
    saveSharedIn.mockResolvedValue("gone");
    expect(await saveSharedRecipe(id)).toEqual(fail("recipe_shared_gone"));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("says the recipe changed when the page showed another version, or the lines changed while saving", async () => {
    expect(await saveSharedRecipe(id, "v0")).toEqual(fail("recipe_shared_changed"));
    expect(commitIngredients).not.toHaveBeenCalled();
    saveSharedIn.mockResolvedValue("changed");
    expect(await saveSharedRecipe(id, "v1")).toEqual(fail("recipe_shared_changed"));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a uuid, and an unauthorized user", async () => {
    expect(await saveSharedRecipe("inte-ett-id")).toEqual(fail("validation"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await saveSharedRecipe(id)).toEqual(fail("unauthorized"));
    expect(getSharedIn).not.toHaveBeenCalled();
  });

  it("fails without data when the database fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    saveSharedIn.mockRejectedValue(new RecipeDataError("shared_save_failed 23503"));
    expect(await saveSharedRecipe(id, "v1")).toEqual(fail("recipe_shared_save_failed"));
    expect(log).toHaveBeenCalledWith("recipe_shared_save_failed", { reason: "shared_save_failed 23503" });
    log.mockRestore();
  });
});

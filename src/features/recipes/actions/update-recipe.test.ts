import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";
import type { RecipeDraft } from "../domain/recipe-draft";

// updateRecipe with the user check, the session client, the catalog, the data
// functions and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
class CatalogDataError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const commitIngredients = vi.fn();
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  commitIngredients: (...args: unknown[]) => commitIngredients(...args),
}));
const savedRecipeRefsIn = vi.fn();
const updateRecipeIn = vi.fn();
vi.mock("../data/update", () => ({
  savedRecipeRefsIn: (...args: unknown[]) => savedRecipeRefsIn(...args),
  updateRecipeIn: (...args: unknown[]) => updateRecipeIn(...args),
}));

const { updateRecipe } = await import("./update-recipe");

const id = "11111111-1111-4111-8111-111111111111";
const lineId = "22222222-2222-4222-8222-222222222222";
const onion = "33333333-3333-4333-8333-333333333333";
const redOnion = "44444444-4444-4444-8444-444444444444";
const stepId = "55555555-5555-4555-8555-555555555555";
const updatedAt = "2026-10-26T10:00:00.123456+00:00";

const draft: RecipeDraft = {
  title: "Linssoppa",
  servings: 4,
  totalMinutes: null,
  imageUrl: null,
  sourceKind: "text",
  sourceUrl: null,
  steps: [{ id: stepId, text: "Koka." }],
  lines: [
    {
      id: lineId,
      originalText: "1 gul lök",
      amount: 1,
      unit: "st",
      isVague: false,
      ingredient: { kind: "chosen", ingredientId: onion },
      stepIndexes: [0],
    },
    {
      originalText: "1 lök",
      amount: 1,
      unit: "st",
      isVague: false,
      ingredient: { kind: "chosen", ingredientId: redOnion },
      stepIndexes: [],
    },
  ],
};

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  savedRecipeRefsIn.mockReset().mockResolvedValue({ updatedAt, lines: new Map([[lineId, onion]]), stepIds: new Set([stepId]) });
  commitIngredients.mockReset().mockResolvedValue([onion, redOnion]);
  updateRecipeIn.mockReset().mockResolvedValue("updated");
  revalidateFor.mockReset();
});

describe("updateRecipe", () => {
  it("commits the catalog choices, updates the recipe and revalidates the recipe routes", async () => {
    expect(await updateRecipe(id, draft, updatedAt)).toEqual(ok({ id }));
    expect(savedRecipeRefsIn).toHaveBeenCalledWith(db, id);
    // The unchanged line saves no synonym; the new line's choice does.
    expect(commitIngredients).toHaveBeenCalledWith([
      { text: "1 gul lök", ingredient: { kind: "match", ingredientId: onion, confidence: "exact" } },
      { text: "1 lök", ingredient: { kind: "chosen", ingredientId: redOnion } },
    ]);
    expect(updateRecipeIn).toHaveBeenCalledWith(db, id, draft, [onion, redOnion], updatedAt);
    expect(revalidateFor).toHaveBeenCalledWith("recipe");
  });

  it("writes the parsed draft: trimmed text, as the schema gives it", async () => {
    const untrimmed: RecipeDraft = {
      ...draft,
      title: "  Linssoppa ",
      steps: [{ id: stepId, text: " Koka. " }],
      lines: [{ ...draft.lines[0], originalText: " 1 gul lök " }, draft.lines[1]],
    };
    expect(await updateRecipe(id, untrimmed, updatedAt)).toEqual(ok({ id }));
    expect(commitIngredients.mock.calls[0][0][0].text).toBe("1 gul lök");
    expect(updateRecipeIn).toHaveBeenCalledWith(db, id, draft, [onion, redOnion], updatedAt);
  });

  it("returns unauthorized without an allowed user, and changes nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await updateRecipe(id, draft, updatedAt)).toEqual(fail("unauthorized"));
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(updateRecipeIn).not.toHaveBeenCalled();
  });

  it.each([
    ["an id that is not a uuid", "inte-ett-id", draft, updatedAt],
    ["an empty title", id, { ...draft, title: " " }, updatedAt],
    ["an empty step", id, { ...draft, steps: [""] }, updatedAt],
    ["no draft", id, undefined, updatedAt],
    ["no updated_at", id, draft, undefined],
    ["an updated_at that is not a time", id, draft, "igår"],
  ])("rejects %s", async (_, recipeId, input, at) => {
    expect(await updateRecipe(recipeId, input as never, at as never)).toEqual(fail("validation"));
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(updateRecipeIn).not.toHaveBeenCalled();
  });

  it("changes nothing, not even the catalog, for a recipe the user does not have", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    savedRecipeRefsIn.mockResolvedValue(null);
    expect(await updateRecipe(id, draft, updatedAt)).toEqual(fail("recipe_save_failed"));
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(updateRecipeIn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("recipe_save_failed", { reason: "not_found" });
    log.mockRestore();
  });

  it("gives recipe_conflict, without writing, when the recipe changed since the form was filled", async () => {
    savedRecipeRefsIn.mockResolvedValue({ updatedAt: "2026-10-26T11:00:00+00:00", lines: new Map(), stepIds: new Set() });
    expect(await updateRecipe(id, draft, updatedAt)).toEqual(fail("recipe_conflict"));
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(updateRecipeIn).not.toHaveBeenCalled();
  });

  it("gives recipe_conflict when the recipe changes between the read and the update", async () => {
    updateRecipeIn.mockResolvedValue("conflict");
    expect(await updateRecipe(id, draft, updatedAt)).toEqual(fail("recipe_conflict"));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it.each([
    ["a line", { ...draft, lines: [{ ...draft.lines[0], id: "66666666-6666-4666-8666-666666666666" }] }],
    ["a step", { ...draft, steps: [{ id: "66666666-6666-4666-8666-666666666666", text: "Koka." }] }],
  ])("refuses %s id the recipe does not have, before the catalog commit", async (_, foreign) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await updateRecipe(id, foreign, updatedAt)).toEqual(fail("validation"));
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(updateRecipeIn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("recipe_save_failed", { reason: "foreign_ids" });
    log.mockRestore();
  });

  it("logs gone_after_commit when the recipe went away after the catalog commit", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    updateRecipeIn.mockResolvedValue("not_found");
    expect(await updateRecipe(id, draft, updatedAt)).toEqual(fail("recipe_save_failed"));
    expect(log).toHaveBeenCalledWith("recipe_save_failed", { reason: "gone_after_commit" });
    expect(revalidateFor).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("says so when two lines with the same text are linked to different ingredients", async () => {
    commitIngredients.mockRejectedValue(new CatalogDataError("conflicting_synonyms"));
    expect(await updateRecipe(id, draft, updatedAt)).toEqual(fail("recipe_conflicting_links"));
    expect(updateRecipeIn).not.toHaveBeenCalled();
  });

  it("gives recipe_save_failed when the catalog or the update fails, and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    commitIngredients.mockRejectedValueOnce(new CatalogDataError("query_failed"));
    expect(await updateRecipe(id, draft, updatedAt)).toEqual(fail("recipe_save_failed"));
    expect(log).toHaveBeenLastCalledWith("recipe_save_failed", { reason: "catalog_query_failed" });

    updateRecipeIn.mockRejectedValueOnce(new RecipeDataError("update_failed 22023"));
    expect(await updateRecipe(id, draft, updatedAt)).toEqual(fail("recipe_save_failed"));
    expect(log).toHaveBeenLastCalledWith("recipe_save_failed", { reason: "update_failed 22023" });
    expect(revalidateFor).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    updateRecipeIn.mockRejectedValue(new TypeError("boom"));
    await expect(updateRecipe(id, draft, updatedAt)).rejects.toThrow("boom");
  });
});

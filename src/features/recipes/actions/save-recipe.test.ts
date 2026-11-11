import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";
import type { RecipeDraft } from "../domain/recipe-draft";

// saveRecipe with the user check, the session client, the catalog, the save and the
// picture stubbed: the recipe is saved as written, its picture is kept after, and a
// picture that cannot be kept never fails the save.

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
const saveRecipeIn = vi.fn();
vi.mock("../data/save", () => ({ saveRecipeIn: (...args: unknown[]) => saveRecipeIn(...args) }));
const storeRecipeImage = vi.fn();
vi.mock("./store-recipe-image", () => ({ storeRecipeImage: (...args: unknown[]) => storeRecipeImage(...args) }));

const { saveRecipe } = await import("./save-recipe");

const id = "11111111-1111-4111-8111-111111111111";
const draft: RecipeDraft = {
  title: "Linssoppa",
  servings: 4,
  totalMinutes: 30,
  imageUrl: "https://img.koket.se/linssoppa.jpg",
  sourceKind: "url",
  sourceUrl: "https://www.koket.se/linssoppa",
  steps: [{ id: "55555555-5555-4555-8555-555555555555", text: "Koka." }],
  lines: [{ originalText: "2 dl röda linser", amount: 2, unit: "dl", isVague: false, ingredient: { kind: "unmatched" }, stepIndexes: [0] }],
};

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  commitIngredients.mockReset().mockResolvedValue([null]);
  saveRecipeIn.mockReset().mockResolvedValue(id);
  storeRecipeImage.mockReset().mockResolvedValue("stored");
  revalidateFor.mockReset();
});

describe("saveRecipe", () => {
  it("saves the recipe exactly as written, then keeps its picture in the app's own storage", async () => {
    const order: string[] = [];
    saveRecipeIn.mockImplementation(async () => (order.push("save"), id));
    storeRecipeImage.mockImplementation(async () => (order.push("picture"), "stored"));
    expect(await saveRecipe(draft, id)).toEqual(ok({ id }));
    expect(saveRecipeIn).toHaveBeenCalledWith(db, id, draft, [null]);
    expect(storeRecipeImage).toHaveBeenCalledWith(db, id);
    expect(order).toEqual(["save", "picture"]);
    expect(revalidateFor).toHaveBeenCalledWith("recipe");
  });

  it("changes no text: the draft that is saved is the draft that came in", async () => {
    await saveRecipe(draft, id);
    expect(saveRecipeIn.mock.calls[0]![2]).toEqual(draft);
  });

  it("makes no picture for a recipe without an image address", async () => {
    expect(await saveRecipe({ ...draft, imageUrl: null }, id)).toEqual(ok({ id }));
    expect(storeRecipeImage).not.toHaveBeenCalled();
  });

  it.each(["failed", "cap", "skipped"])("still saves the recipe when its picture ends as %s", async (outcome) => {
    storeRecipeImage.mockResolvedValue(outcome);
    expect(await saveRecipe(draft, id)).toEqual(ok({ id }));
  });

  it("makes no picture when the recipe could not be saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saveRecipeIn.mockRejectedValue(new RecipeDataError("save_failed 23505"));
    expect(await saveRecipe(draft, id)).toEqual(fail("recipe_save_failed"));
    expect(storeRecipeImage).not.toHaveBeenCalled();
  });

  it("refuses an unauthorized user and an invalid draft before anything is fetched", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await saveRecipe(draft, id)).toEqual(fail("unauthorized"));
    requireUser.mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
    expect(await saveRecipe({ ...draft, title: "" }, id)).toEqual(fail("validation"));
    expect(storeRecipeImage).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { toSnapshot } from "@/features/pantry";

// getRecipeWithPantry with the session client, the recipe query and the
// pantry stubbed: a pantry that cannot be read never takes the recipe down.

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/features/catalog/server", () => ({ getIngredientNames: vi.fn() }));
vi.mock("./actions/import-recipe", () => ({ importRecipe: vi.fn() }));
vi.mock("./actions/search-recipes", () => ({ searchRecipes: vi.fn() }));
const getRecipeIn = vi.fn();
const listRecipesIn = vi.fn();
vi.mock("./data/queries", () => ({
  getRecipe: (...args: unknown[]) => getRecipeIn(...args),
  listRecipes: (...args: unknown[]) => listRecipesIn(...args),
}));
// pantry.getPantryForStatus is tested in pantry/server.test.ts: here, what it gives.
const getPantryForStatus = vi.fn();
vi.mock("@/features/pantry/server", () => ({ getPantryForStatus: () => getPantryForStatus() }));
/** The pantry for the status, on Stugan. */
const onStugan = (snapshot: ReturnType<typeof toSnapshot>) =>
  getPantryForStatus.mockResolvedValue({ site: stugan, snapshot });
/** Neither place nor pantry: one of them could not be read. */
const unreadable = () => getPantryForStatus.mockResolvedValue({ site: null, snapshot: null });

const { getRecipeWithPantry, listLibrary } = await import("./server");

const id = "11111111-1111-4111-8111-111111111111";
const line = (ingredientId: string | null) => ({ id: `line-${ingredientId}`, ingredientId, amount: 1, unit: "dl", isVague: false });
const recipe = { id, title: "Pasta", servings: 4, lines: [line("gradde"), line(null)], steps: [] };

const libraryRow = {
  id,
  title: "Pasta",
  imageUrl: null,
  totalMinutes: 20,
  originalServings: 4,
  isFavorite: false,
  createdAt: "2026-10-01T08:00:00+00:00",
  lines: [line("gradde")],
};

const stugan = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", siteCount: 2 };

/** The library row as the page gets it, without its lines. */
const libraryItem = Object.fromEntries(Object.entries(libraryRow).filter(([key]) => key !== "lines"));

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  getRecipeIn.mockReset().mockResolvedValue(recipe);
  listRecipesIn.mockReset().mockResolvedValue([libraryRow]);
  getPantryForStatus.mockReset().mockResolvedValue({ site: stugan, snapshot: toSnapshot([]) });
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getRecipeWithPantry", () => {
  it("gives the recipe and the pantry, only for the recipe's own ingredients", async () => {
    onStugan(
      toSnapshot([
        { ingredientId: "gradde", amount: 2, unit: "dl" },
        { ingredientId: "mjol", amount: 1, unit: "kg" },
      ]),
    );
    const found = await getRecipeWithPantry(id);
    expect(found?.recipe).toBe(recipe);
    expect(found?.site).toBe(stugan);
    expect(found?.snapshot).toEqual(new Map([["gradde", { unlimited: false, amounts: [{ unit: "dl", amount: 2 }] }]]));
  });

  it("gives the recipe without status or place when the place or the pantry cannot be read", async () => {
    unreadable();
    const found = await getRecipeWithPantry(id);
    expect(found).toEqual({ recipe, snapshot: null, site: null });
  });

  it("gives null for a recipe that is not found", async () => {
    getRecipeIn.mockResolvedValue(null);
    expect(await getRecipeWithPantry(id)).toBeNull();
  });

  it("gives null for an id that is not a uuid without reading the recipe or the pantry", async () => {
    expect(await getRecipeWithPantry("inte-ett-id")).toBeNull();
    expect(getRecipeIn).not.toHaveBeenCalled();
    expect(getPantryForStatus).not.toHaveBeenCalled();
  });
});

describe("listLibrary", () => {
  it("gives the rows with their status, says the pantry was read, and has the place it is of", async () => {
    onStugan(toSnapshot([{ ingredientId: "gradde", amount: 2, unit: "dl" }]));
    expect(await listLibrary()).toEqual({
      recipes: [{ ...libraryItem, missingCount: 0 }],
      pantryUnavailable: false,
      site: stugan,
    });
  });

  it("gives the rows without status or place, and pantryUnavailable, when the place or the pantry cannot be read", async () => {
    unreadable();
    expect(await listLibrary()).toEqual({
      recipes: [{ ...libraryItem, missingCount: null }],
      pantryUnavailable: true,
      site: null,
    });
  });
});

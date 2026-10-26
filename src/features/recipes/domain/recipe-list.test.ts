import { describe, expect, it } from "vitest";
import { toSnapshot, type StatusLine } from "@/features/pantry";
import {
  favoriteChangeSchema,
  filterRecipes,
  parseRecipeFilter,
  recipeMetaText,
  recipeSearchSchema,
  withStatus,
  type RecipeListRow,
} from "./recipe-list";

describe("recipeMetaText", () => {
  it("gives time and servings", () => {
    expect(recipeMetaText(35, 4)).toBe("35 min · 4 portioner");
  });

  it("leaves out a missing or zero time and says portion for one", () => {
    expect(recipeMetaText(null, 4)).toBe("4 portioner");
    expect(recipeMetaText(0, 1)).toBe("1 portion");
  });
});

describe("parseRecipeFilter", () => {
  it("knows Favoriter and makes everything else Alla", () => {
    expect(parseRecipeFilter("favorites")).toBe("favorites");
    expect(parseRecipeFilter("all")).toBe("all");
    expect(parseRecipeFilter(null)).toBe("all");
    expect(parseRecipeFilter("kan-lagas")).toBe("all");
  });
});

describe("filterRecipes", () => {
  const recipes = [
    { id: "a", isFavorite: true },
    { id: "b", isFavorite: false },
    { id: "c", isFavorite: true },
  ];

  it("keeps all for Alla, and only favourites, in order, for Favoriter", () => {
    const now = (recipe: { isFavorite: boolean }) => recipe.isFavorite;
    expect(filterRecipes(recipes, "all", now).map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(filterRecipes(recipes, "favorites", now).map(({ id }) => id)).toEqual(["a", "c"]);
  });

  it("asks whether a recipe is a favourite now, not what the row says", () => {
    expect(filterRecipes(recipes, "favorites", ({ id }) => id === "b").map(({ id }) => id)).toEqual(["b"]);
  });
});

describe("schemas", () => {
  it("allows search text of at most 100 characters", () => {
    expect(recipeSearchSchema.safeParse("a".repeat(100)).success).toBe(true);
    expect(recipeSearchSchema.safeParse("a".repeat(101)).success).toBe(false);
    expect(recipeSearchSchema.safeParse(42).success).toBe(false);
  });

  it("needs a uuid and a boolean for a favourite", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(favoriteChangeSchema.safeParse({ id, isFavorite: true }).success).toBe(true);
    expect(favoriteChangeSchema.safeParse({ id: "x", isFavorite: true }).success).toBe(false);
    expect(favoriteChangeSchema.safeParse({ id, isFavorite: "ja" }).success).toBe(false);
  });
});

describe("withStatus", () => {
  const row = (id: string, servings: number, lines: StatusLine[]): RecipeListRow => ({
    id,
    title: id,
    imageUrl: null,
    totalMinutes: null,
    originalServings: servings,
    isFavorite: false,
    lines: lines.map((line) => ({ ...line, originalText: line.id })),
  });

  it("gives each row N for its own servings, keeps the order and drops the lines", () => {
    const snapshot = toSnapshot([{ ingredientId: "gradde", amount: 2, unit: "dl" }]);
    const items = withStatus(
      [
        row("soppa", 2, [{ id: "l1", ingredientId: "gradde", amount: 3, unit: "dl", isVague: false }]),
        row("gryta", 4, [
          { id: "l2", ingredientId: "gradde", amount: 2, unit: "dl", isVague: false },
          { id: "l3", ingredientId: null, amount: 600, unit: "g", isVague: false },
          { id: "l4", ingredientId: "salt", amount: null, unit: null, isVague: true },
        ]),
      ],
      snapshot,
    );
    expect(items).toEqual([
      { id: "soppa", title: "soppa", imageUrl: null, totalMinutes: null, originalServings: 2, isFavorite: false, missingCount: 1 },
      { id: "gryta", title: "gryta", imageUrl: null, totalMinutes: null, originalServings: 4, isFavorite: false, missingCount: 0 },
    ]);
  });

  it("gives no status without a snapshot, when the pantry could not be read", () => {
    const items = withStatus([row("soppa", 2, [{ id: "l1", ingredientId: "gradde", amount: 3, unit: "dl", isVague: false }])], null);
    expect(items).toEqual([
      { id: "soppa", title: "soppa", imageUrl: null, totalMinutes: null, originalServings: 2, isFavorite: false, missingCount: null },
    ]);
  });
});

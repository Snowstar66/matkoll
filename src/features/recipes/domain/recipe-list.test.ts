import { describe, expect, it } from "vitest";
import { toSnapshot, type StatusLine } from "@/features/pantry";
import {
  favoriteChangeSchema,
  filterRecipes,
  parseRecipeFilter,
  RECIPE_FILTERS,
  recipeMetaText,
  recipeTimeText,
  recipeSearchSchema,
  toLibrary,
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

describe("recipeTimeText", () => {
  it("gives the time alone, and nothing without one", () => {
    expect(recipeTimeText(35)).toBe("35 min");
    expect(recipeTimeText(null)).toBeNull();
    expect(recipeTimeText(0)).toBeNull();
  });
});

describe("parseRecipeFilter", () => {
  it("knows Favoriter and Kan lagas nu and makes everything else Alla", () => {
    expect(RECIPE_FILTERS).toEqual(["all", "favorites", "cookable"]);
    expect(parseRecipeFilter("favorites")).toBe("favorites");
    expect(parseRecipeFilter("cookable")).toBe("cookable");
    expect(parseRecipeFilter("all")).toBe("all");
    expect(parseRecipeFilter(null)).toBe("all");
    expect(parseRecipeFilter("kan-lagas")).toBe("all");
    expect(parseRecipeFilter("Cookable")).toBe("all");
    expect(parseRecipeFilter(1)).toBe("all");
  });
});

describe("filterRecipes", () => {
  const recipes = [
    { id: "a", isFavorite: true, createdAt: "2026-10-03", missingCount: 0 },
    { id: "b", isFavorite: false, createdAt: "2026-10-02", missingCount: 0 },
    { id: "c", isFavorite: true, createdAt: "2026-10-01", missingCount: 0 },
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

describe("filterRecipes for Kan lagas nu", () => {
  /** Recipes newest first, as the server gives them, with N; r0 is the newest. */
  const list = (...counts: (number | null)[]) =>
    counts.map((missingCount, index) => ({
      id: `r${index}`,
      isFavorite: false,
      createdAt: `2026-10-${String(20 - index).padStart(2, "0")}T08:00:00+00:00`,
      missingCount,
    }));
  type Row = ReturnType<typeof list>[number];
  const cookable = (recipes: readonly Row[]) =>
    filterRecipes(recipes, "cookable", () => false).map(({ id, missingCount }) => `${id}:${missingCount}`);

  it("keeps every recipe, fewest missing first, the cookable ones newest first", () => {
    expect(cookable(list(2, 0, 1, 0))).toEqual(["r1:0", "r3:0", "r2:1", "r0:2"]);
  });

  it("puts the newest first among equal N, whatever order the rows come in, then sorts by id", () => {
    const [newest, middle, oldest] = list(1, 1, 1);
    expect(cookable([oldest, newest, middle])).toEqual(["r0:1", "r1:1", "r2:1"]);
    const twin = { ...middle, id: "r1-twin" };
    expect(cookable([twin, oldest, middle, newest])).toEqual(["r0:1", "r1:1", "r1-twin:1", "r2:1"]);
  });

  it("ranks the list when nothing can be cooked now", () => {
    expect(cookable(list(3, 1, 2))).toEqual(["r1:1", "r2:2", "r0:3"]);
  });

  it("keeps newest first when no row has a status", () => {
    const [a, b, c] = list(null, null, null);
    expect(cookable([c, a, b])).toEqual(["r0:null", "r1:null", "r2:null"]);
  });

  it("puts rows without a status last, newest first among them, after the ranked ones", () => {
    expect(cookable(list(null, 2, null, 0))).toEqual(["r3:0", "r1:2", "r0:null", "r2:null"]);
  });

  it("treats a count that is not a finite number of at least 0 as no status", () => {
    const rows = list(1, 0, null, null, null, null).map((row, index) =>
      index < 2 ? row : { ...row, missingCount: [-1, Number.NaN, Number.POSITIVE_INFINITY, "2" as unknown as number][index - 2] },
    );
    expect(filterRecipes(rows, "cookable", () => false).map(({ id }) => id)).toEqual(["r1", "r0", "r2", "r3", "r4", "r5"]);
  });

  it("does not change the input", () => {
    const recipes = list(2, 0, 1);
    const before = structuredClone(recipes);
    const ranked = filterRecipes(recipes, "cookable", () => false);
    expect(recipes).toEqual(before);
    expect(ranked).not.toBe(recipes);
    expect(filterRecipes(recipes, "all", () => false)).not.toBe(recipes);
  });

  it("ignores favourites", () => {
    const recipes = list(1, 0);
    expect(filterRecipes(recipes, "cookable", ({ id }) => id === "r0").map(({ id }) => id)).toEqual(["r1", "r0"]);
  });
});

describe("toLibrary", () => {
  const row: RecipeListRow = {
    id: "soppa",
    title: "soppa",
    imageUrl: null,
    totalMinutes: null,
    originalServings: 2,
    isFavorite: false,
    createdAt: "2026-10-01T08:00:00+00:00",
    lines: [{ id: "l1", ingredientId: "gradde", amount: 3, unit: "dl", isVague: false, originalText: "3 dl grädde" }],
  };

  const stugan = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", siteCount: 2 };

  it("gives the rows with status, says the pantry was read, and has the place it is of", () => {
    const library = toLibrary([row], toSnapshot([{ ingredientId: "gradde", amount: 3, unit: "dl" }]), stugan);
    expect(library.pantryUnavailable).toBe(false);
    expect(library.site).toBe(stugan);
    expect(library.recipes.map(({ missingCount }) => missingCount)).toEqual([0]);
  });

  it("says the pantry could not be read without a snapshot, and has no place then", () => {
    const library = toLibrary([row], null, stugan);
    expect(library.pantryUnavailable).toBe(true);
    expect(library.site).toBeNull();
    expect(library.recipes.map(({ missingCount }) => missingCount)).toEqual([null]);
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
    createdAt: "2026-10-01T08:00:00+00:00",
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
      { id: "soppa", title: "soppa", imageUrl: null, totalMinutes: null, originalServings: 2, isFavorite: false, createdAt: "2026-10-01T08:00:00+00:00", missingCount: 1 },
      { id: "gryta", title: "gryta", imageUrl: null, totalMinutes: null, originalServings: 4, isFavorite: false, createdAt: "2026-10-01T08:00:00+00:00", missingCount: 0 },
    ]);
  });

  it("gives no status without a snapshot, when the pantry could not be read", () => {
    const items = withStatus([row("soppa", 2, [{ id: "l1", ingredientId: "gradde", amount: 3, unit: "dl", isVague: false }])], null);
    expect(items).toEqual([
      { id: "soppa", title: "soppa", imageUrl: null, totalMinutes: null, originalServings: 2, isFavorite: false, createdAt: "2026-10-01T08:00:00+00:00", missingCount: null },
    ]);
  });
});

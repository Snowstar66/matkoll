import { describe, expect, it } from "vitest";
import { toSnapshot, type StatusLine } from "@/features/pantry";
import {
  favoriteChangeSchema,
  filterByCategory,
  filterRecipes,
  nearlyCookable,
  parseRecipeFilter,
  parseRecipeSort,
  offerTagsShown,
  parseRecipeView,
  rankByOffers,
  RECIPE_FILTERS,
  recipeMetaText,
  recipeTimeText,
  recipeSearchSchema,
  sortRecipes,
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
  it("knows Favoriter, Kan lagas nu and Erbjudanden and makes everything else Alla", () => {
    expect(RECIPE_FILTERS).toEqual(["all", "favorites", "cookable", "offers"]);
    expect(parseRecipeFilter("offers")).toBe("offers");
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

  it("keeps only the recipes with nothing missing, in the given order", () => {
    expect(cookable(list(2, 0, 1, 0))).toEqual(["r1:0", "r3:0"]);
  });

  it("leaves out rows without a status, and counts that are not a finite number of at least 0", () => {
    const rows = list(0, null, 0, 0, 0).map((row, index) =>
      index < 3 ? row : { ...row, missingCount: [-1, Number.NaN][index - 3] },
    );
    expect(filterRecipes(rows, "cookable", () => false).map(({ id }) => id)).toEqual(["r0", "r2"]);
  });

  it("does not change the input", () => {
    const recipes = list(2, 0, 1);
    const before = structuredClone(recipes);
    const ranked = filterRecipes(recipes, "cookable", () => false);
    expect(recipes).toEqual(before);
    expect(ranked).not.toBe(recipes);
  });

  it("ignores favourites", () => {
    expect(filterRecipes(list(1, 0), "cookable", ({ id }) => id === "r0").map(({ id }) => id)).toEqual(["r1"]);
  });
});

describe("nearlyCookable", () => {
  it("keeps recipes missing 1 or 2, fewest first and stable, and drops 0, 3+ and no status", () => {
    const rows = [3, 2, 0, 1, null, 2, 11].map((missingCount, i) => ({ id: `r${i}`, missingCount }));
    expect(nearlyCookable(rows).map(({ id }) => id)).toEqual(["r3", "r1", "r5"]);
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
      { gradde: "Grädde" },
    );
    expect(items).toEqual([
      { id: "soppa", title: "soppa", categories: ["vegetarian", "soup"], dish: "soppa", imageUrl: null, totalMinutes: null, originalServings: 2, isFavorite: false, createdAt: "2026-10-01T08:00:00+00:00", missingCount: 1, missingNames: ["Grädde"] },
      { id: "gryta", title: "gryta", categories: ["vegetarian", "stew"], dish: "gryta", imageUrl: null, totalMinutes: null, originalServings: 4, isFavorite: false, createdAt: "2026-10-01T08:00:00+00:00", missingCount: 0, missingNames: [] },
    ]);
  });

  it("gives no status without a snapshot, when the pantry could not be read", () => {
    const items = withStatus([row("soppa", 2, [{ id: "l1", ingredientId: "gradde", amount: 3, unit: "dl", isVague: false }])], null);
    expect(items).toEqual([
      { id: "soppa", title: "soppa", categories: ["vegetarian", "soup"], dish: "soppa", imageUrl: null, totalMinutes: null, originalServings: 2, isFavorite: false, createdAt: "2026-10-01T08:00:00+00:00", missingCount: null },
    ]);
  });
});

describe("sortRecipes", () => {
  const item = (id: string, title: string, totalMinutes: number | null, missingCount: number | null, createdAt: string) => ({
    id,
    title,
    totalMinutes,
    missingCount,
    createdAt,
  });
  const recipes = [
    item("a", "Ärtsoppa", 60, 2, "2026-10-01T08:00:00+00:00"),
    item("b", "Zucchinipasta", 20, 0, "2026-10-03T08:00:00+00:00"),
    item("c", "Älggryta", null, 0, "2026-10-02T08:00:00+00:00"),
    item("d", "Åkerbär", 0, null, "2026-10-04T08:00:00+00:00"),
    item("e", "Bullar", 20, 1, "2026-10-05T08:00:00+00:00"),
  ];
  const ids = (sort: Parameters<typeof sortRecipes>[1]) => sortRecipes(recipes, sort).map((recipe) => recipe.id);

  it("puts the newest first, which is Senast tillagda", () => {
    expect(ids("newest")).toEqual(["e", "d", "b", "c", "a"]);
  });

  it("puts the shortest time first and a recipe without a time (or 0) last, equal times newest first", () => {
    expect(ids("fastest")).toEqual(["e", "b", "a", "d", "c"]);
  });

  it("puts the fewest missing first and a row without a status last", () => {
    expect(ids("mostHome")).toEqual(["b", "c", "e", "a", "d"]);
  });

  it("sorts A–Ö in Swedish order, with å, ä and ö after z", () => {
    expect(ids("alphabetical")).toEqual(["e", "b", "d", "c", "a"]);
  });

  it("leaves the input unchanged", () => {
    const before = recipes.map((recipe) => recipe.id);
    sortRecipes(recipes, "alphabetical");
    expect(recipes.map((recipe) => recipe.id)).toEqual(before);
  });
});

describe("parseRecipeSort and parseRecipeView", () => {
  it("keep a known choice and fall back to Senast tillagda and the cards", () => {
    expect(parseRecipeSort("alphabetical")).toBe("alphabetical");
    expect(parseRecipeSort("x")).toBe("newest");
    expect(parseRecipeView("compact")).toBe("compact");
    expect(parseRecipeView(null)).toBe("cards");
  });
});

describe("filterByCategory", () => {
  const rows = [{ id: "a", categories: ["poultry", "quick"] as const }, { id: "b", categories: ["meat"] as const }, { id: "c" }];

  it("keeps the recipes in the category, and all of them without one", () => {
    expect(filterByCategory(rows, "poultry").map((row) => row.id)).toEqual(["a"]);
    expect(filterByCategory(rows, "fish")).toEqual([]);
    expect(filterByCategory(rows, null)).toHaveLength(3);
  });
});

describe("withStatus categories", () => {
  it("works the categories out from the title, the written lines and the time, with or without a pantry", () => {
    const rows: RecipeListRow[] = [
      {
        id: "soppa",
        title: "Grönsakssoppa",
        imageUrl: null,
        totalMinutes: 25,
        originalServings: 4,
        isFavorite: false,
        createdAt: "2026-10-01T08:00:00+00:00",
        lines: [{ id: "l1", ingredientId: null, amount: 1, unit: "l", isVague: false, originalText: "1 l kycklingbuljong" }],
      },
    ];
    expect(withStatus(rows, null)[0].categories).toEqual(["vegetarian", "soup", "quick"]);
    expect(toLibrary(rows, toSnapshot([]), null).recipes[0].categories).toEqual(["vegetarian", "soup", "quick"]);
  });
});

describe("withStatus dish (UX-13b)", () => {
  it("works the drawing out from the title and the written lines, with or without a pantry", () => {
    const rows: RecipeListRow[] = [
      {
        id: "fredag",
        title: "Fredagsmys",
        imageUrl: null,
        totalMinutes: 25,
        originalServings: 4,
        isFavorite: false,
        createdAt: "2026-10-01T08:00:00+00:00",
        lines: [{ id: "l1", ingredientId: null, amount: 400, unit: "g", isVague: false, originalText: "400 g köttfärs" }],
      },
    ];
    expect(withStatus(rows, null)[0].dish).toBe("kott");
    expect(toLibrary(rows, toSnapshot([]), null).recipes[0].dish).toBe("kott");
  });
});

describe("rankByOffers (Story 9.3)", () => {
  const row = (id: string, missingCount: number | null, createdAt = "2026-10-01") => ({ id, createdAt, missingCount });
  const tags = { a: ["Falukorv"], b: ["Falukorv", "Gul lök"], c: ["Laxfilé"], d: ["Laxfilé"], e: [] as string[] };

  it("keeps only recipes with an offer, the most offers first and then the fewest missing", () => {
    const ranked = rankByOffers([row("a", 0), row("b", 5), row("c", 3), row("d", 1), row("e", 0), row("f", 0)], tags);
    expect(ranked.map(({ id }) => id)).toEqual(["b", "a", "d", "c"]);
  });

  it("puts a row without a status after the others with as many offers, and leaves the input unchanged", () => {
    const input = [row("c", null), row("d", 4)];
    expect(rankByOffers(input, tags).map(({ id }) => id)).toEqual(["d", "c"]);
    expect(input.map(({ id }) => id)).toEqual(["c", "d"]);
  });

  it("shows nothing without tags", () => {
    expect(rankByOffers([row("a", 0)], {})).toEqual([]);
  });
});

describe("offerTagsShown", () => {
  it("shows two tags and counts the rest", () => {
    expect(offerTagsShown(["a"])).toEqual({ shown: ["a"], more: 0 });
    expect(offerTagsShown(["a", "b", "c", "d"])).toEqual({ shown: ["a", "b"], more: 2 });
  });
});

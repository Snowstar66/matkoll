import { describe, expect, it } from "vitest";
import type { IngredientMatch } from "@/features/catalog";
import {
  copyIngredientFor,
  copyLineIngredients,
  newIngredientViewId,
  parseSharedRecipe,
  savedByText,
  searchShared,
  sharedByText,
  sharedChoices,
  sharedCountText,
  sharedFromText,
  sharedMatchItems,
  stopSharingDetail,
  toSharedListItems,
  toSharedView,
} from "./shared-recipe";

const raw = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Caesarkyckling",
  servings: 4,
  total_minutes: 45,
  image_url: "https://img.example.test/caesar.jpg",
  source_kind: "url",
  source_url: "https://www.tasteline.com/recept/caesar",
  household_name: "Lindqvists",
  saved_copy_id: null,
  version: "v1",
  steps: [
    { title: "Kyckling", text: "Stek kycklingen i 10 minuter." },
    { title: null, text: "Servera." },
  ],
  lines: [
    { original_text: "600 g kycklingfilé", amount: 600, unit: "g", is_vague: false, section: "Kyckling", step_index: 0, ingredient_name: "Kycklingfilé", ingredient_section: "Kött och fisk" },
    { original_text: "1 romansallad", amount: 1, unit: "st", is_vague: false, section: null, step_index: 1, ingredient_name: "Romansallad", ingredient_section: "Frukt och grönt" },
    { original_text: "salt", amount: null, unit: null, is_vague: true, section: null, step_index: null, ingredient_name: null, ingredient_section: null },
  ],
};

const chicken = "22222222-2222-4222-8222-222222222222";

describe("parseSharedRecipe", () => {
  it("reads get_shared_recipe's answer, and none or a broken answer as null", () => {
    const shared = parseSharedRecipe(raw)!;
    expect(shared).toMatchObject({ title: "Caesarkyckling", householdName: "Lindqvists", servings: 4, totalMinutes: 45, savedCopyId: null });
    expect(shared.lines[0]).toEqual({
      originalText: "600 g kycklingfilé",
      amount: 600,
      unit: "g",
      isVague: false,
      group: "Kyckling",
      stepIndex: 0,
      ingredientName: "Kycklingfilé",
      ingredientSection: "Kött och fisk",
      isStapleMarked: false,
    });
    expect(parseSharedRecipe(null)).toBeNull();
    expect(parseSharedRecipe({ ...raw, servings: 0 })).toBeNull();
    expect(parseSharedRecipe({ ...raw, lines: [{ ...raw.lines[0], unit: "kopp" }] })).toBeNull();
  });

  it("drops a step index past the steps", () => {
    const shared = parseSharedRecipe({ ...raw, lines: [{ ...raw.lines[0], step_index: 5 }] })!;
    expect(shared.lines[0].stepIndex).toBeNull();
  });
});

describe("matching a shared recipe to the household's catalog", () => {
  const shared = parseSharedRecipe(raw)!;

  it("matches by the ingredient's name, with its section as the hint, and a line without one by nothing", () => {
    expect(sharedMatchItems(shared.lines)).toEqual([
      { text: "Kycklingfilé", hint: { name: "Kycklingfilé", section: "Kött och fisk", location: "", defaultUnit: "" } },
      { text: "Romansallad", hint: { name: "Romansallad", section: "Frukt och grönt", location: "", defaultUnit: "" } },
      { text: "" },
    ]);
  });

  it("commits each match under the ingredient's name, so no synonym is made from the line", () => {
    const matches: IngredientMatch[] = [
      { kind: "match", ingredientId: chicken, confidence: "exact" },
      { kind: "new", proposal: { name: "Romansallad", section: "Frukt och grönt", location: "Kyl", defaultUnit: null } },
      { kind: "unmatched" },
    ];
    expect(sharedChoices(shared.lines, matches)).toEqual([
      { text: "Kycklingfilé", ingredient: matches[0] },
      { text: "Romansallad", ingredient: matches[1] },
      { text: "salt", ingredient: matches[2] },
    ]);
    expect(() => sharedChoices(shared.lines, matches.slice(1))).toThrow();
  });

  it("shows an ingredient the household lacks as one of its own, never at home, and keeps steps by their place", () => {
    const view = toSharedView(shared, [
      { kind: "match", ingredientId: chicken, confidence: "exact" },
      { kind: "new", proposal: { name: "Romansallad", section: "Frukt och grönt", location: "Kyl", defaultUnit: null } },
      { kind: "unmatched" },
    ]);
    expect(view).toMatchObject({ id: raw.id, title: "Caesarkyckling", isFavorite: false, servings: 4, sourceKind: "url" });
    expect(view.steps.map((step) => [step.id, step.title])).toEqual([
      ["step-0", "Kyckling"],
      ["step-1", null],
    ]);
    expect(view.lines.map((line) => [line.id, line.ingredientId, line.ingredientName, line.stepId, line.group])).toEqual([
      ["line-0", chicken, "Kycklingfilé", "step-0", "Kyckling"],
      ["line-1", newIngredientViewId("Romansallad"), "Romansallad", "step-1", null],
      ["line-2", null, null, null, null],
    ]);
    expect(newIngredientViewId("Romansallad")).toBe("new:romansallad");
  });

  it("maps a shown ingredient to the copy's by its line, also after the lines were read again", () => {
    const copyIds = [chicken, "c-2", null];
    const before = [{ ingredientId: chicken }, { ingredientId: "new:romansallad" }, { ingredientId: null }];
    expect(copyIngredientFor(before, copyIds, chicken)).toBe(chicken);
    expect(copyIngredientFor(before, copyIds, "new:romansallad")).toBe("c-2");
    // Read again after the copy: the lettuce is now in the household's catalog.
    const after = [{ ingredientId: chicken }, { ingredientId: "c-2" }, { ingredientId: null }];
    expect(copyIngredientFor(after, copyIds, "c-2")).toBe("c-2");
    // A household id no line has any more is the copy's as it is; a new one the copy lacks is none.
    expect(copyIngredientFor(after, copyIds, "c-9")).toBe("c-9");
    expect(copyIngredientFor(after, copyIds, "new:gurka")).toBeNull();
  });

  it("takes a saved copy's ingredients from its own lines, by text", () => {
    expect(
      copyLineIngredients(shared.lines, [
        { originalText: "salt", ingredientId: null },
        { originalText: "600 g kycklingfilé", ingredientId: "c-1" },
      ]),
    ).toEqual(["c-1", null, null]);
  });

  it("reads the version and the staple mark", () => {
    expect(shared.version).toBe("v1");
    expect(parseSharedRecipe({ ...raw, lines: [{ ...raw.lines[0], is_staple_marked: true }] })!.lines[0].isStapleMarked).toBe(true);
    expect(toSharedView(parseSharedRecipe({ ...raw, lines: [{ ...raw.lines[0], is_staple_marked: true }] })!, [{ kind: "unmatched" }]).lines[0].isStapleMarked).toBe(true);
  });
});

describe("the Delade list", () => {
  const rows = [
    {
      id: "a",
      title: "Kycklinggryta med tomat och grädde",
      originalServings: 4,
      totalMinutes: 35,
      imageUrl: null,
      householdName: "Lindqvists",
      createdAt: "2026-11-08T10:00:00Z",
      savedCopyId: "copy-a",
      lineTexts: ["600 g kycklingfilé", "2 dl grädde"],
    },
    { id: "b", title: "Linssoppa", originalServings: 4, totalMinutes: 30, imageUrl: null, householdName: "Bergs", createdAt: "2026-11-07T10:00:00Z", savedCopyId: null, lineTexts: ["3 dl röda linser"] },
  ];

  it("makes library items without favourite or status, with categories and the drawing", () => {
    const [stew, soup] = toSharedListItems(rows);
    expect(stew).toMatchObject({ isFavorite: false, missingCount: null, householdName: "Lindqvists", savedCopyId: "copy-a", dish: "gryta" });
    expect(stew.categories).toContain("poultry");
    expect(soup.categories).toContain("soup");
  });

  it("searches titles and lines, in any case", () => {
    const items = toSharedListItems(rows);
    expect(searchShared(items, "LINSER").map((item) => item.id)).toEqual(["b"]);
    expect(searchShared(items, "gryta").map((item) => item.id)).toEqual(["a"]);
    expect(searchShared(items, "  ").map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("the words", () => {
  it("names who saved a copy, counting more than three", () => {
    expect(savedByText([])).toBeNull();
    expect(savedByText(["Lindqvists"])).toBe("Sparat av Lindqvists");
    expect(savedByText(["Lindqvists", "Bergs"])).toBe("Sparat av Lindqvists och Bergs");
    expect(savedByText(["Lindqvists", "Bergs", "Ek"])).toBe("Sparat av Lindqvists, Bergs och Ek");
    expect(savedByText(["A", "B", "C", "D"])).toBe("Sparat av 4 hushåll");
  });

  it("says whose it is, how many, and what Sluta dela alla does", () => {
    expect(sharedByText("Lindqvists")).toBe("Delat av Lindqvists");
    expect(sharedFromText("Bergs")).toBe("från Bergs");
    expect(sharedCountText(8)).toBe("8 delade recept");
    expect(sharedCountText(1)).toBe("1 delat recept");
    expect(stopSharingDetail(3)).toBe("3 recept slutar delas. Kopior som andra redan har sparat finns kvar hos dem.");
  });
});

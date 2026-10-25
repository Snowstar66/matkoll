import { describe, expect, it } from "vitest";
import { hasOnlySavedIds, lineChoices, savedIngredientNames, toEditableDraft } from "./editable-draft";
import { recipeDraftSchema, validateDraft, type RecipeLine } from "./recipe-draft";
import { toUpdateRecipeArgs, type SavedRecipe } from "./saved-recipe";

const recipeId = "00000000-0000-4000-8000-000000000001";
const step0 = "00000000-0000-4000-8000-000000000010";
const step1 = "00000000-0000-4000-8000-000000000011";
const lineA = "00000000-0000-4000-8000-000000000020";
const lineB = "00000000-0000-4000-8000-000000000021";
const lineC = "00000000-0000-4000-8000-000000000022";
const onion = "00000000-0000-4000-8000-000000000030";
const salt = "00000000-0000-4000-8000-000000000031";
const redOnion = "00000000-0000-4000-8000-000000000032";

const saved: SavedRecipe = {
  id: recipeId,
  title: "Linssoppa",
  servings: 4,
  totalMinutes: 30,
  imageUrl: "https://www.koket.se/bild.jpg",
  sourceKind: "url",
  sourceUrl: "https://www.koket.se/linssoppa",
  isFavorite: true,
  updatedAt: "2026-10-26T10:00:00.123456+00:00",
  steps: [
    { id: step0, position: 0, text: "Hacka löken." },
    { id: step1, position: 1, text: "Koka allt." },
  ],
  lines: [
    {
      id: lineA,
      position: 0,
      originalText: "1 gul lök",
      amount: 1,
      unit: "st",
      isVague: false,
      ingredientId: onion,
      ingredientName: "Gul lök",
      stepId: step1,
    },
    {
      id: lineB,
      position: 1,
      originalText: "salt efter smak",
      amount: null,
      unit: null,
      isVague: true,
      ingredientId: salt,
      ingredientName: "Salt",
      stepId: null,
    },
    {
      id: lineC,
      position: 2,
      originalText: "något gott",
      amount: null,
      unit: null,
      isVague: true,
      ingredientId: null,
      ingredientName: null,
      stepId: null,
    },
  ],
};

describe("toEditableDraft", () => {
  it("makes a valid draft with the saved ids, chosen ingredients and step links", () => {
    const draft = toEditableDraft(saved);
    expect(draft).toEqual({
      title: "Linssoppa",
      servings: 4,
      totalMinutes: 30,
      imageUrl: "https://www.koket.se/bild.jpg",
      sourceKind: "url",
      sourceUrl: "https://www.koket.se/linssoppa",
      steps: [
        { id: step0, text: "Hacka löken." },
        { id: step1, text: "Koka allt." },
      ],
      lines: [
        {
          id: lineA,
          originalText: "1 gul lök",
          amount: 1,
          unit: "st",
          isVague: false,
          ingredient: { kind: "chosen", ingredientId: onion },
          stepIndexes: [1],
        },
        {
          id: lineB,
          originalText: "salt efter smak",
          amount: null,
          unit: null,
          isVague: true,
          ingredient: { kind: "chosen", ingredientId: salt },
          stepIndexes: [],
        },
        {
          id: lineC,
          originalText: "något gott",
          amount: null,
          unit: null,
          isVague: true,
          ingredient: { kind: "unmatched" },
          stepIndexes: [],
        },
      ],
    });
    expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
    expect(validateDraft(draft)).toEqual({});
  });

  it("gives the names of the saved ingredients by id", () => {
    expect(savedIngredientNames(saved)).toEqual({ [onion]: "Gul lök", [salt]: "Salt" });
  });

  it("maps back to update_recipe's rows with the kept ids, and new rows without", () => {
    const draft = toEditableDraft(saved);
    const changed = {
      ...draft,
      title: " Röd linssoppa ",
      steps: [draft.steps[1], "Servera."],
      lines: [{ ...draft.lines[0], stepIndexes: [0] }, { ...draft.lines[2] }, { ...draft.lines[2], id: undefined, originalText: "vatten" }],
    };
    expect(toUpdateRecipeArgs(recipeId, changed, [onion, null, null], saved.updatedAt)).toEqual({
      id: recipeId,
      expected_updated_at: "2026-10-26T10:00:00.123456+00:00",
      recipe: { title: "Röd linssoppa", original_servings: 4, total_minutes: 30 },
      steps: [
        { id: step1, position: 0, text: "Koka allt." },
        { id: null, position: 1, text: "Servera." },
      ],
      lines: [
        { id: lineA, position: 0, original_text: "1 gul lök", amount: 1, unit: "st", is_vague: false, ingredient_id: onion, step_position: 0 },
        { id: lineC, position: 1, original_text: "något gott", amount: null, unit: null, is_vague: true, ingredient_id: null, step_position: null },
        { id: null, position: 2, original_text: "vatten", amount: null, unit: null, is_vague: true, ingredient_id: null, step_position: null },
      ],
    });
    expect(() => toUpdateRecipeArgs(recipeId, changed, [onion], saved.updatedAt)).toThrow();
  });
});

describe("hasOnlySavedIds", () => {
  const refs = { lines: new Map<string, string | null>([[lineA, onion], [lineB, salt], [lineC, null]]), stepIds: new Set([step0, step1]) };

  it("accepts the saved ids and rows without ids", () => {
    const draft = toEditableDraft(saved);
    expect(hasOnlySavedIds(draft, refs)).toBe(true);
    expect(hasOnlySavedIds({ ...draft, steps: [...draft.steps, "Servera."], lines: [{ ...draft.lines[0], id: undefined }] }, refs)).toBe(true);
  });

  it("refuses a line or step id the recipe does not have", () => {
    const draft = toEditableDraft(saved);
    expect(hasOnlySavedIds({ ...draft, lines: [{ ...draft.lines[0], id: step0 }] }, refs)).toBe(false);
    expect(hasOnlySavedIds({ ...draft, steps: [{ id: lineA, text: "Koka." }] }, refs)).toBe(false);
  });
});

describe("lineChoices", () => {
  const stored = new Map<string, string | null>([
    [lineA, onion],
    [lineB, salt],
    [lineC, null],
  ]);

  it("saves no synonym for a kept line whose ingredient did not change", () => {
    const [kept] = lineChoices(toEditableDraft(saved).lines, stored);
    expect(kept).toEqual({ text: "1 gul lök", ingredient: { kind: "match", ingredientId: onion, confidence: "exact" } });
  });

  it("keeps a relinked line as chosen, so the catalog saves the synonym", () => {
    const lines: RecipeLine[] = toEditableDraft(saved).lines.map((line) =>
      line.id === lineA ? { ...line, ingredient: { kind: "chosen", ingredientId: redOnion } } : line,
    );
    expect(lineChoices(lines, stored)[0].ingredient).toEqual({ kind: "chosen", ingredientId: redOnion });
  });

  it("keeps chosen ingredients on new lines and other kinds as they are", () => {
    const fresh: RecipeLine = {
      originalText: "1 gul lök",
      amount: 1,
      unit: "st",
      isVague: false,
      ingredient: { kind: "chosen", ingredientId: onion },
      stepIndexes: [],
    };
    const proposal = { name: "Morot", section: "Frukt och grönt", location: "Kyl", defaultUnit: "st" } as const;
    const newOne: RecipeLine = { ...fresh, ingredient: { kind: "new", proposal } };
    expect(lineChoices([fresh, newOne], stored).map(({ ingredient }) => ingredient)).toEqual([
      { kind: "chosen", ingredientId: onion },
      { kind: "new", proposal },
    ]);
    // A line id that is not saved (another recipe's) is never taken as unchanged.
    expect(lineChoices([{ ...fresh, id: step0 }], stored)[0].ingredient.kind).toBe("chosen");
  });
});

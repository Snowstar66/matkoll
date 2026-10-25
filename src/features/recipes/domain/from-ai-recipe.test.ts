import { describe, expect, it } from "vitest";
import type { IngredientMatch } from "@/features/catalog";
import { fromAiRecipe, type AiRecipeLike } from "./from-ai-recipe";
import { recipeDraftSchema } from "./recipe-draft";
import fiskgratang from "../../../../tests/fixtures/ai/fiskgratang.response.json";
import kladdkaka from "../../../../tests/fixtures/ai/kladdkaka.response.json";
import kycklinggryta from "../../../../tests/fixtures/ai/kycklinggryta.response.json";
import linssoppa from "../../../../tests/fixtures/ai/linssoppa.response.json";
import ugnspannkaka from "../../../../tests/fixtures/ai/ugnspannkaka.response.json";

const id = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const match: IngredientMatch = { kind: "match", ingredientId: id, confidence: "exact" };
const proposal = (name: string): IngredientMatch => ({
  kind: "new",
  proposal: { name, section: "Skafferi", location: "Skafferi", defaultUnit: null },
});

const line = (overrides: Partial<AiRecipeLike["ingredients"][number]> = {}) => ({
  originalText: "2 dl grädde",
  amount: 2,
  unit: "dl",
  isVague: false,
  stepIndexes: [0],
  ...overrides,
});

const recipe = (overrides: Partial<AiRecipeLike> = {}): AiRecipeLike => ({
  title: "Soppa",
  servings: 4,
  totalMinutes: 30,
  ingredients: [line()],
  steps: ["Koka.", "Servera."],
  ...overrides,
});

describe("fromAiRecipe", () => {
  it("maps title, servings, time, steps and a text source", () => {
    const draft = fromAiRecipe(recipe(), [match], { kind: "text" });
    expect(draft).toEqual({
      title: "Soppa",
      servings: 4,
      totalMinutes: 30,
      imageUrl: null,
      sourceKind: "text",
      sourceUrl: null,
      steps: ["Koka.", "Servera."],
      lines: [
        { originalText: "2 dl grädde", amount: 2, unit: "dl", isVague: false, ingredient: match, stepIndexes: [0] },
      ],
    });
    expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("normalises the unit with the catalog and keeps the amount", () => {
    const draft = fromAiRecipe(
      recipe({ ingredients: [line({ unit: "deciliter", amount: 1.5 }), line({ unit: "burk", amount: 1 }), line({ unit: null })] }),
      [match, match, match],
      { kind: "text" },
    );
    expect(draft.lines.map(({ amount, unit, isVague }) => ({ amount, unit, isVague }))).toEqual([
      { amount: 1.5, unit: "dl", isVague: false },
      { amount: 1, unit: "förp", isVague: false },
      { amount: 2, unit: null, isVague: false },
    ]);
  });

  it("makes a line with an unknown unit vague, without amount and unit", () => {
    const draft = fromAiRecipe(
      recipe({ ingredients: [line({ originalText: "1 bit färsk ingefära", amount: 1, unit: "bit" })] }),
      [match],
      { kind: "text" },
    );
    expect(draft.lines[0]).toMatchObject({ originalText: "1 bit färsk ingefära", amount: null, unit: null, isVague: true });
  });

  it("keeps a vague line vague", () => {
    const draft = fromAiRecipe(
      recipe({ ingredients: [line({ originalText: "salt", amount: null, unit: null, isVague: true })] }),
      [match],
      { kind: "text" },
    );
    expect(draft.lines[0]).toMatchObject({ amount: null, unit: null, isVague: true });
  });

  it.each([
    ["no amount", null],
    ["a zero amount", 0],
    ["a negative amount", -1],
    ["an amount that is not finite", Number.POSITIVE_INFINITY],
  ])("makes a line with %s vague and drops its unit", (_name, amount) => {
    const draft = fromAiRecipe(recipe({ ingredients: [line({ amount, unit: "dl", isVague: false })] }), [match], {
      kind: "text",
    });
    expect(draft.lines[0]).toMatchObject({ amount: null, unit: null, isVague: true });
    expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("keeps the AI's hint on the line", () => {
    const hint = { name: "grädde", section: "Mejeri", location: "Kyl", defaultUnit: "dl" };
    const draft = fromAiRecipe(recipe({ ingredients: [line({ hint })] }), [match], { kind: "text" });
    expect(draft.lines[0].hint).toEqual(hint);
    expect(fromAiRecipe(recipe(), [match], { kind: "text" }).lines[0]).not.toHaveProperty("hint");
  });

  it("gives line i the match at index i", () => {
    const matches = [proposal("Grädde"), match];
    const draft = fromAiRecipe(recipe({ ingredients: [line(), line({ originalText: "1 lök" })] }), matches, {
      kind: "text",
    });
    expect(draft.lines.map((l) => l.ingredient)).toEqual(matches);
  });

  it("removes step indexes that point at no step, and duplicates", () => {
    const draft = fromAiRecipe(recipe({ ingredients: [line({ stepIndexes: [1, 5, 1, 0, -1] })] }), [match], {
      kind: "text",
    });
    expect(draft.lines[0].stepIndexes).toEqual([0, 1]);
  });

  it("drops empty steps and moves the step indexes with the steps that are kept", () => {
    const draft = fromAiRecipe(
      recipe({ steps: ["Koka.", "  ", "Servera."], ingredients: [line({ stepIndexes: [1, 2] })] }),
      [match],
      { kind: "text" },
    );
    expect(draft.steps).toEqual(["Koka.", "Servera."]);
    expect(draft.lines[0].stepIndexes).toEqual([1]);
  });

  it("sets the source URL and image only for a link", () => {
    const fromUrl = fromAiRecipe(recipe(), [match], {
      kind: "url",
      url: "https://www.koket.se/soppa",
      imageUrl: "https://www.koket.se/soppa.jpg",
    });
    expect(fromUrl).toMatchObject({
      sourceKind: "url",
      sourceUrl: "https://www.koket.se/soppa",
      imageUrl: "https://www.koket.se/soppa.jpg",
    });
    expect(fromAiRecipe(recipe(), [match], { kind: "photo" })).toMatchObject({
      sourceKind: "photo",
      sourceUrl: null,
      imageUrl: null,
    });
  });

  it("needs one match per line", () => {
    expect(() => fromAiRecipe(recipe(), [], { kind: "text" })).toThrow();
  });

  it("maps every recipe in the AI test set to a valid draft", () => {
    const answers: Record<string, AiRecipeLike> = { fiskgratang, kladdkaka, kycklinggryta, linssoppa, ugnspannkaka };
    for (const [name, ai] of Object.entries(answers)) {
      const draft = fromAiRecipe(ai, ai.ingredients.map(() => match), { kind: "text" });
      expect(recipeDraftSchema.safeParse(draft).success, name).toBe(true);
      expect(draft.lines).toHaveLength(ai.ingredients.length);
    }
  });
});

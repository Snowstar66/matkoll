import { describe, expect, it } from "vitest";
import type { IngredientMatch } from "@/features/catalog";
import { fromAiRecipe, type AiRecipeLike } from "./from-ai-recipe";
import { recipeDraftSchema } from "./recipe-draft";
import fiskgratang from "../../../../tests/fixtures/ai/fiskgratang.response.json";
import kladdkaka from "../../../../tests/fixtures/ai/kladdkaka.response.json";
import kycklinggryta from "../../../../tests/fixtures/ai/kycklinggryta.response.json";
import linasKyckling from "../../../../tests/fixtures/ai/linas-kyckling.response.json";
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

  it("makes a line with a unit nobody knows vague, without amount and unit", () => {
    const draft = fromAiRecipe(
      recipe({ ingredients: [line({ originalText: "1 sked färsk ingefära", amount: 1, unit: "sked" })] }),
      [match],
      { kind: "text" },
    );
    expect(draft.lines[0]).toMatchObject({ originalText: "1 sked färsk ingefära", amount: null, unit: null, isVague: true });
  });

  it.each([
    ["1 näve spenat", 1, "näve", 1, "dl"],
    ["1 nypa muskot", 1, "nypa", 1, "krm"],
    ["1 bit ingefära", 1, "bit", 1, "st"],
    ["2 cups flour", 2, "cups", 5, "dl"],
    ["1 lb ground beef", 1, "lb", 455, "g"],
    ["2 tbsp sugar", 2, "tbsp", 2, "msk"],
    ["1 can tomatoes", 1, "can", 1, "förp"],
  ])("keeps the amount of %s, converted to a catalog unit", (originalText, amount, unit, kept, keptUnit) => {
    const draft = fromAiRecipe(recipe({ ingredients: [line({ originalText, amount, unit })] }), [match], { kind: "text" });
    expect(draft.lines[0]).toMatchObject({ originalText, amount: kept, unit: keptUnit, isVague: false });
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

  it("keeps ingredient groups, staple marks and step headings, and leaves them out when there are none", () => {
    const draft = fromAiRecipe(
      recipe({
        ingredients: [
          line({ group: "Rostad småpotatis", isStapleMarked: false, stepIndexes: [1] }),
          line({ originalText: "olivolja", amount: null, unit: null, isVague: true, group: "Rostad småpotatis", isStapleMarked: true }),
          line({ group: null, isStapleMarked: false }),
        ],
        steps: [
          { title: null, text: "Värm ugnen." },
          { title: " Rostad småpotatis ", text: "Rosta potatisen." },
        ],
      }),
      [match, match, match],
      { kind: "photo" },
    );
    expect(draft.steps).toEqual(["Värm ugnen.", { text: "Rosta potatisen.", title: "Rostad småpotatis" }]);
    expect(draft.lines.map((l) => [l.group, l.isStapleMarked])).toEqual([
      ["Rostad småpotatis", undefined],
      ["Rostad småpotatis", true],
      [undefined, undefined],
    ]);
    expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("cuts a long group or heading to 60 characters, whole letters, and drops a blank one", () => {
    const long = `${"Gräddkokt spetskål ".repeat(4)}🥬 och mer`;
    const draft = fromAiRecipe(
      recipe({ ingredients: [line({ group: long })], steps: [{ title: long, text: "Koka." }, { title: "   ", text: "Servera." }] }),
      [match],
      { kind: "photo" },
    );
    const group = draft.lines[0].group ?? "";
    expect(group.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(group)).toBe(true);
    expect(draft.steps[1]).toBe("Servera.");
    expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("maps the Linas card to four groups, eight staples and four step headings", () => {
    const draft = fromAiRecipe(linasKyckling, linasKyckling.ingredients.map(() => match), { kind: "photo" });
    expect([...new Set(draft.lines.map((l) => l.group))]).toEqual([
      "Rostad småpotatis",
      "Örtstekt kyckling",
      "Tryffelsky",
      "Gräddkokt spetskål",
    ]);
    expect(draft.lines.filter((l) => l.isStapleMarked)).toHaveLength(8);
    expect(draft.steps.filter((step) => typeof step !== "string")).toHaveLength(4);
  });

  it("reads cloves written inside the noun as klyfta, not whole bulbs", () => {
    const garlic = { name: "vitlök", section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" } as const;
    const lines = [
      line({ originalText: "2 vitlöksklyftor", amount: 2, unit: null, hint: garlic }),
      line({ originalText: "3 klyftor vitlök, pressade", amount: 3, unit: "st", hint: garlic }),
      line({ originalText: "1 vitlök", amount: 1, unit: null, hint: garlic }),
      line({ originalText: "1/2 vitlök", amount: 0.5, unit: null, hint: garlic }),
      line({ originalText: "2 vitlöksklyftor", amount: 2, unit: "klyftor", hint: garlic }),
      line({ originalText: "vitlöksklyftor efter smak", amount: null, unit: null, isVague: true, hint: garlic }),
      line({ originalText: "4 brödskivor", amount: 4, unit: null, hint: { ...garlic, name: "brödskiva" } }),
      line({ originalText: "4 brödskivor", amount: 4, unit: null }),
    ];
    const matches = [match, match, match, match, match, match, match, proposal("brödskiva")];
    const draft = fromAiRecipe(recipe({ ingredients: lines }), matches, { kind: "url", url: "https://example.se/r" });
    expect(draft.lines.map((l) => [l.amount, l.unit, l.isVague])).toEqual([
      [2, "klyfta", false],
      [3, "klyfta", false],
      [1, null, false],
      [0.5, null, false],
      [2, "klyfta", false],
      [null, null, true],
      [4, null, false],
      [4, null, false],
    ]);
  });

  it("needs one match per line", () => {
    expect(() => fromAiRecipe(recipe(), [], { kind: "text" })).toThrow();
  });

  it("maps every recipe in the AI test set to a valid draft", () => {
    const answers: Record<string, AiRecipeLike> = { fiskgratang, kladdkaka, kycklinggryta, linssoppa, ugnspannkaka, linasKyckling };
    for (const [name, ai] of Object.entries(answers)) {
      const draft = fromAiRecipe(ai, ai.ingredients.map(() => match), { kind: "text" });
      expect(recipeDraftSchema.safeParse(draft).success, name).toBe(true);
      expect(draft.lines).toHaveLength(ai.ingredients.length);
    }
  });
});

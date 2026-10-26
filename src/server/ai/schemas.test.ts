import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  aiPantryItem,
  aiRecipe,
  analyzeImageAnswer,
  locateItemsAnswer,
  maxPantryItemTextChars,
  minLoopRepeats,
  parseAnalyzeItems,
  parseItemPositions,
  parseRecipeAnswer,
  suggestDishesAnswer,
  suggestDishesAnswerFor,
} from "./schemas";
import { validRecipe } from "./test-support";

describe("aiRecipe", () => {
  it("accepts a complete recipe", () => {
    expect(aiRecipe.parse(validRecipe)).toEqual(validRecipe);
  });

  it.each([
    ["servings below 1", { servings: 0 }],
    ["servings that are not whole", { servings: 2.5 }],
    ["minutes that are not whole", { totalMinutes: 12.5 }],
    ["an empty title", { title: "" }],
    ["a whitespace-only title", { title: "   " }],
    ["no steps", { steps: [] }],
    ["a whitespace-only step", { steps: ["Vispa.", "  "] }],
    ["no ingredients", { ingredients: [] }],
  ])("rejects %s", (_name, change) => {
    expect(aiRecipe.safeParse({ ...validRecipe, ...change }).success).toBe(false);
  });

  it("rejects empty hint fields and original text", () => {
    const line = validRecipe.ingredients[0];
    for (const change of [
      { originalText: " " },
      { hint: { ...line.hint, name: "" } },
      { hint: { ...line.hint, section: " " } },
      { hint: { ...line.hint, location: "" } },
      { hint: { ...line.hint, defaultUnit: "\t" } },
    ]) {
      expect(aiRecipe.safeParse({ ...validRecipe, ingredients: [{ ...line, ...change }] }).success).toBe(false);
    }
  });

  it("maps an empty unit to null and trims text", () => {
    const line = { ...validRecipe.ingredients[0], unit: " ", originalText: " 3 mjölk " };
    const parsed = aiRecipe.parse({ ...validRecipe, title: " Pannkakor ", ingredients: [line] });
    expect(parsed.ingredients[0].unit).toBeNull();
    expect(parsed.ingredients[0].originalText).toBe("3 mjölk");
    expect(parsed.title).toBe("Pannkakor");
  });

  it("accepts free-text section, location and unit; the catalog interprets them", () => {
    const line = {
      ...validRecipe.ingredients[0],
      unit: "burk",
      hint: { name: "krossade tomater", section: "Konserver", location: "Skåp", defaultUnit: "burk" },
    };
    expect(aiRecipe.safeParse({ ...validRecipe, ingredients: [line] }).success).toBe(true);
  });

  it("requires a vague line to have neither amount nor unit", () => {
    const vague = validRecipe.ingredients[1];
    expect(aiRecipe.safeParse({ ...validRecipe, ingredients: [{ ...vague, amount: 1 }] }).success).toBe(false);
    expect(aiRecipe.safeParse({ ...validRecipe, ingredients: [{ ...vague, unit: "nypa" }] }).success).toBe(false);
  });

  it("requires step indexes, pointing at existing steps", () => {
    const line = validRecipe.ingredients[0];
    expect(aiRecipe.safeParse({ ...validRecipe, ingredients: [{ ...line, stepIndexes: [2] }] }).success).toBe(false);
    expect(aiRecipe.safeParse({ ...validRecipe, ingredients: [{ ...line, stepIndexes: [] }] }).success).toBe(true);
    const withoutIndexes: Record<string, unknown> = { ...line };
    delete withoutIndexes.stepIndexes;
    expect(aiRecipe.safeParse({ ...validRecipe, ingredients: [withoutIndexes] }).success).toBe(false);
  });
});

describe("parseRecipeAnswer", () => {
  it("is either a recipe or noRecipe", () => {
    expect(parseRecipeAnswer.safeParse({ noRecipe: false, recipe: validRecipe }).success).toBe(true);
    expect(parseRecipeAnswer.safeParse({ noRecipe: true, recipe: null }).success).toBe(true);
    expect(parseRecipeAnswer.safeParse({ noRecipe: true, recipe: validRecipe }).success).toBe(false);
    expect(parseRecipeAnswer.safeParse({ noRecipe: false, recipe: null }).success).toBe(false);
  });
});

describe("suggestDishesAnswer", () => {
  const dish = (title: string) => ({ ...validRecipe, title });
  const three = [dish("Pannkakor"), dish("Linssoppa"), dish("Fiskgratäng")];
  const issues = (value: unknown) => {
    const result = suggestDishesAnswer.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
  };

  it("accepts three valid recipes with titles of their own", () => {
    expect(suggestDishesAnswer.parse({ suggestions: three })).toEqual({ suggestions: three });
  });

  it.each([
    ["two", three.slice(0, 2)],
    ["four", [...three, dish("Köttbullar")]],
    ["none", []],
  ])("rejects %s suggestions, with the path for the model", (_name, suggestions) => {
    expect(issues({ suggestions })).toEqual([
      { path: ["suggestions"], message: `Give exactly 3 suggestions, not ${suggestions.length}` },
    ]);
  });

  it("rejects a title given twice, without regard to case or whitespace", () => {
    expect(issues({ suggestions: [three[0], three[1], dish("PANNKAKOR")] })).toEqual([
      { path: ["suggestions", 2, "title"], message: "Each suggestion needs a title of its own" },
    ]);
    expect(issues({ suggestions: [dish("Röd linssoppa"), dish("röd  LINSSOPPA"), three[2]] })).toEqual([
      { path: ["suggestions", 1, "title"], message: "Each suggestion needs a title of its own" },
    ]);
  });

  it("rejects a title to avoid, normalized, with the path for the model", () => {
    const schema = suggestDishesAnswerFor(["  linssoppa ", "Köttbullar"]);
    const result = schema.safeParse({ suggestions: [three[0], dish("LINSSOPPA"), three[2]] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(({ path, message }) => ({ path, message }))).toEqual([
      { path: ["suggestions", 1, "title"], message: "This title was suggested before; suggest another dish" },
    ]);
    expect(schema.safeParse({ suggestions: [three[0], dish("Röd linssoppa"), three[2]] }).success).toBe(true);
  });

  it("rejects a step index that points past the steps", () => {
    const line = { ...validRecipe.ingredients[0], stepIndexes: [5] };
    const broken = { ...three[1], ingredients: [line] };
    expect(issues({ suggestions: [three[0], broken, three[2]] })).toEqual([
      { path: ["suggestions", 1, "ingredients", 0, "stepIndexes", 0], message: "stepIndexes must point at an existing step" },
    ]);
  });

  it("has a JSON schema without minItems or maxItems over 1 on suggestions, so strict providers take it", () => {
    expect(z.toJSONSchema(suggestDishesAnswerFor(["Pannkakor"]), { io: "input" })).toEqual(
      z.toJSONSchema(suggestDishesAnswer, { io: "input" }),
    );
    const schema = z.toJSONSchema(suggestDishesAnswer, { io: "input" }) as unknown as {
      properties: { suggestions: { type: string; minItems?: number; maxItems?: number } };
    };
    const { suggestions } = schema.properties;
    expect(suggestions.type).toBe("array");
    expect(suggestions.minItems ?? 0).toBeLessThanOrEqual(1);
    expect(suggestions.maxItems ?? 1).toBeLessThanOrEqual(1);
    expect(suggestions.maxItems).toBeUndefined();
  });
});

describe("analyzeImageAnswer and aiPantryItem", () => {
  const item = {
    label: "Arla mellanmjölk",
    confidence: "säker" as const,
    amount: 1,
    unit: "förp",
    hint: { name: "mellanmjölk", section: "Mejeri", location: "Kyl", defaultUnit: "förp" },
  };

  it("takes any answer with a list of items of the right shape, also one with an item that will not pass", () => {
    const answer = { items: [item, { ...item, label: "", amount: -1 }] };
    expect(analyzeImageAnswer.parse(answer)).toEqual(answer);
    expect(analyzeImageAnswer.parse({ items: [] })).toEqual({ items: [] });
  });

  it("refuses an answer that is broken as a whole: no list, or an item of the wrong shape", () => {
    expect(analyzeImageAnswer.safeParse({}).success).toBe(false);
    expect(analyzeImageAnswer.safeParse({ items: null }).success).toBe(false);
    expect(analyzeImageAnswer.safeParse({ items: [{ label: "Mjölk" }] }).success).toBe(false);
    expect(analyzeImageAnswer.safeParse({ items: [{ ...item, amount: "1" }] }).success).toBe(false);
  });

  it("checks each item on its own: valid ones in order, and a count of the others", () => {
    const smor = { ...item, label: "Smör" };
    const result = parseAnalyzeItems([item, { ...item, label: " " }, "inte en vara", smor, { ...item, amount: -1 }]);
    expect(result.items.map(({ label }) => label)).toEqual(["Arla mellanmjölk", "Smör"]);
    expect(result.invalid).toBe(3);
    expect(parseAnalyzeItems([])).toEqual({ items: [], invalid: 0, repeated: 0 });
  });

  it("merges a loop into its first copy without adding the amounts, and counts the most repeats of one label (Story 6.5)", () => {
    const gradde = { ...item, label: "Grädde", hint: { ...item.hint, name: "grädde" } };
    // Near copies: the same label with an amount and unit, or a full stop, are the same label.
    const loop = [gradde, ...Array.from({ length: 10 }, () => gradde), { ...gradde, label: "Grädde 3 dl" }, { ...gradde, label: "grädde." }];
    const result = parseAnalyzeItems([item, ...loop, { ...item, label: "Ägg", amount: 6, unit: "st" }]);
    expect(result.items.map(({ label, amount }) => [label, amount])).toEqual([
      ["Arla mellanmjölk", 1],
      ["Grädde", 1],
      ["Ägg", 6],
    ]);
    expect(result.repeated).toBe(12);
    expect(minLoopRepeats).toBe(2);
    expect(result.invalid).toBe(0);
  });

  it("merges a single duplicate quietly, adding amounts in the same unit, and keeps it unsure if a copy is (Story 6.5)", () => {
    const result = parseAnalyzeItems([
      item,
      { ...item, label: " arla  MELLANMJÖLK ", amount: 2, confidence: "osäker" },
      { ...item, label: "Ägg", amount: 6, unit: "st" },
      { ...item, label: "Ägg 6 st", amount: 1, unit: "förp" },
    ]);
    expect(result.items.map(({ label, amount, unit, confidence }) => [label, amount, unit, confidence])).toEqual([
      ["Arla mellanmjölk", 3, "förp", "osäker"],
      // Different units are not added: the first copy's amount.
      ["Ägg", 6, "st", "säker"],
    ]);
    expect(result.repeated).toBe(1);
  });

  it("takes the first amount in a loop when the first copy has none, and is unsure when any copy is", () => {
    const smor = { ...item, label: "Smör", amount: null, unit: null };
    const result = parseAnalyzeItems([smor, { ...smor, amount: 2, unit: "förp", confidence: "osäker" }, { ...smor, amount: 3, unit: "förp" }]);
    expect(result.items).toEqual([{ ...smor, amount: 2, unit: "förp", confidence: "osäker" }]);
    expect(result.repeated).toBe(2);
  });

  it("does not count an invalid item as seen: a valid one with its label comes through", () => {
    const result = parseAnalyzeItems([{ ...item, amount: -1 }, item]);
    expect(result).toMatchObject({ invalid: 1, repeated: 0 });
    expect(result.items).toHaveLength(1);
  });

  it("reads the confidence leniently: säker, saker, sure or certain is säker, anything else or nothing is osäker", () => {
    const of = (confidence: unknown) => aiPantryItem.parse({ ...item, confidence }).confidence;
    expect([of("säker"), of(" Säker "), of("saker"), of("sure"), of("CERTAIN")]).toEqual(Array(5).fill("säker"));
    expect([of("Osäker"), of("kanske"), of(undefined), of(1), of(null)]).toEqual(Array(5).fill("osäker"));
  });

  it("never makes an answer invalid over an odd confidence: Osäker, sure and a missing one all pass", () => {
    const withoutConfidence: Partial<typeof item> = { ...item };
    delete withoutConfidence.confidence;
    const answer = { items: [{ ...item, confidence: "Osäker" }, { ...item, label: "Smör", confidence: "sure" }, { ...withoutConfidence, label: "Ost" }] };
    expect(analyzeImageAnswer.safeParse(answer).success).toBe(true);
    const result = parseAnalyzeItems(answer.items);
    expect(result.invalid).toBe(0);
    expect(result.items.map(({ label, confidence }) => [label, confidence])).toEqual([
      ["Arla mellanmjölk", "osäker"],
      ["Smör", "säker"],
      ["Ost", "osäker"],
    ]);
  });

  it("accepts free-text units, maps an empty unit to null, trims the label and takes an amount of 0 as none", () => {
    expect(aiPantryItem.parse({ ...item, unit: "tub" }).unit).toBe("tub");
    expect(aiPantryItem.parse({ ...item, label: " Smör ", amount: null, unit: " " })).toMatchObject({
      label: "Smör",
      amount: null,
      unit: null,
    });
    expect(aiPantryItem.parse({ ...item, amount: 0 }).amount).toBeNull();
  });

  it.each([
    ["a negative amount", { amount: -1 }],
    ["an empty label", { label: " " }],
    ["a label over 200 characters", { label: "x".repeat(maxPantryItemTextChars + 1) }],
    ["no hint", { hint: undefined }],
    ["a hint without a name", { hint: { ...item.hint, name: "" } }],
    ["a hint name over 200 characters", { hint: { ...item.hint, name: "x".repeat(maxPantryItemTextChars + 1) } }],
  ])("refuses an item with %s", (_name, change) => {
    expect(aiPantryItem.safeParse({ ...item, ...change }).success).toBe(false);
  });

  it("has a JSON schema with every field required, no minItems or maxItems on items, and no defaults", () => {
    const schema = z.toJSONSchema(analyzeImageAnswer, { io: "input" }) as unknown as {
      required: string[];
      properties: { items: { type: string; minItems?: number; maxItems?: number; items: { required: string[] } } };
    };
    expect(schema.required).toEqual(["items"]);
    const { items } = schema.properties;
    expect(items.type).toBe("array");
    expect(items.minItems).toBeUndefined();
    expect(items.maxItems).toBeUndefined();
    expect(items.items.required.sort()).toEqual(["amount", "confidence", "hint", "label", "unit"]);
    expect(JSON.stringify(schema)).toContain('"enum":["säker","osäker"]');
    expect(JSON.stringify(schema)).not.toMatch(/"default"|"minLength"|"maxLength"|"minimum"|"exclusiveMinimum"/);
  });
});

describe("locateItemsAnswer and parseItemPositions (Story 6.6)", () => {
  it("takes any list of numbers and points as a whole, so one bad point never fails the answer", () => {
    expect(locateItemsAnswer.safeParse({ positions: [{ n: 99, position: [1, 2, 3] }] }).success).toBe(true);
    expect(locateItemsAnswer.safeParse({ positions: [] }).success).toBe(true);
    expect(locateItemsAnswer.safeParse({ points: [] }).success).toBe(false);
    expect(locateItemsAnswer.safeParse({ positions: [{ n: "1", position: [1, 2] }] }).success).toBe(false);
  });

  it("has no tuple, minimum or maximum in its JSON schema, so strict providers take it", () => {
    const schema = JSON.stringify(z.toJSONSchema(locateItemsAnswer, { io: "input" }));
    expect(schema).not.toMatch(/prefixItems|minItems|maxItems|minimum|maximum/);
  });

  it("keeps the points with a whole number within the labels and two coordinates from 0 to 1000, sorted by number", () => {
    expect(
      parseItemPositions(
        [
          { n: 3, position: [1000, 0] },
          { n: 1, position: [12.5, 40] },
        ],
        3,
      ),
    ).toEqual({
      positions: [
        { n: 1, x: 12.5, y: 40 },
        { n: 3, x: 1000, y: 0 },
      ],
      invalid: 0,
    });
  });

  it.each([
    ["number 0", { n: 0, position: [1, 1] }],
    ["a number beyond the labels", { n: 4, position: [1, 1] }],
    ["a fraction", { n: 1.5, position: [1, 1] }],
    ["a coordinate over 1000", { n: 1, position: [1001, 1] }],
    ["a negative coordinate", { n: 1, position: [1, -1] }],
    ["one coordinate", { n: 1, position: [1] }],
    ["three coordinates", { n: 1, position: [1, 1, 1] }],
    ["no position", { n: 1 }],
    ["not an object", "1: [1, 1]"],
  ])("leaves out a point with %s and counts it", (_name, point) => {
    expect(parseItemPositions([point, { n: 2, position: [5, 5] }], 3)).toEqual({
      positions: [{ n: 2, x: 5, y: 5 }],
      invalid: 1,
    });
  });

  it("keeps the first point for a number given twice and counts the second", () => {
    expect(
      parseItemPositions(
        [
          { n: 1, position: [1, 1] },
          { n: 1, position: [9, 9] },
        ],
        1,
      ),
    ).toEqual({ positions: [{ n: 1, x: 1, y: 1 }], invalid: 1 });
  });
});

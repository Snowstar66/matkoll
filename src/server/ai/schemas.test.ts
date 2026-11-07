import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  aiPantryItem,
  aiRecipe,
  analyzeImageAnswer,
  maxPantryItemTextChars,
  matchOffersAnswer,
  minLoopRepeats,
  parseOfferMatches,
  parseShoppingList,
  shoppingListAnswer,
  maxListItems,
  parseAnalyzeItems,
  pointScale,
  parseRecipeAnswer,
  compactDish,
  suggestDishesAnswerCompact,
  suggestDishesAnswerCompactFor,
} from "./schemas";
import { validCompactDish, validRecipe } from "./test-support";

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
    ["a whitespace-only step", { steps: [{ title: null, text: "Vispa." }, { title: null, text: "  " }] }],
    ["a step as plain text, without its heading", { steps: ["Vispa.", "Stek."] }],
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

  it("keeps ingredient groups, staple marks and step headings (the Linas Matkasse format)", () => {
    const line = { ...validRecipe.ingredients[0], group: " Rostad småpotatis ", isStapleMarked: true };
    const parsed = aiRecipe.parse({
      ...validRecipe,
      ingredients: [line],
      steps: [
        { title: null, text: "Värm ugnen." },
        { title: "Rostad småpotatis", text: "Rosta potatisen." },
      ],
    });
    expect(parsed.ingredients[0]).toMatchObject({ group: "Rostad småpotatis", isStapleMarked: true });
    expect(parsed.steps.map((step) => step.title)).toEqual([null, "Rostad småpotatis"]);
  });

  it("maps an empty group or step heading to null", () => {
    const line = { ...validRecipe.ingredients[0], group: "  " };
    const parsed = aiRecipe.parse({ ...validRecipe, ingredients: [line], steps: [{ title: "", text: "Vispa." }] });
    expect(parsed.ingredients[0].group).toBeNull();
    expect(parsed.steps[0].title).toBeNull();
  });

  it("requires the group, the staple mark and the step heading, as strict JSON schemas do", () => {
    const line = validRecipe.ingredients[0];
    for (const key of ["group", "isStapleMarked"] as const) {
      const without: Record<string, unknown> = { ...line };
      delete without[key];
      expect(aiRecipe.safeParse({ ...validRecipe, ingredients: [without] }).success, key).toBe(false);
    }
    expect(aiRecipe.safeParse({ ...validRecipe, steps: [{ text: "Vispa." }] }).success).toBe(false);
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

describe("suggestDishesAnswerCompact", () => {
  const dish = (title: string) => ({ ...validCompactDish, title });
  const three = [dish("Pannkakor"), dish("Linssoppa"), dish("Fiskgratäng")];
  const issues = (value: unknown) => {
    const result = suggestDishesAnswerCompact.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
  };

  it("accepts three valid recipes with titles of their own", () => {
    expect(suggestDishesAnswerCompact.parse({ suggestions: three })).toEqual({ suggestions: three });
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
    const schema = suggestDishesAnswerCompactFor(["  linssoppa ", "Köttbullar"]);
    const result = schema.safeParse({ suggestions: [three[0], dish("LINSSOPPA"), three[2]] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(({ path, message }) => ({ path, message }))).toEqual([
      { path: ["suggestions", 1, "title"], message: "This title was suggested before; suggest another dish" },
    ]);
    expect(schema.safeParse({ suggestions: [three[0], dish("Röd linssoppa"), three[2]] }).success).toBe(true);
  });

  it("takes one to three dishes for Vad kan jag laga nu? (Story 25.2), and still no more", () => {
    const flexible = suggestDishesAnswerCompactFor([], { flexibleCount: true });
    expect(flexible.safeParse({ suggestions: [three[0]] }).success).toBe(true);
    expect(flexible.safeParse({ suggestions: [three[0], three[1]] }).success).toBe(true);
    expect(flexible.safeParse({ suggestions: three }).success).toBe(true);
    expect(flexible.safeParse({ suggestions: [] }).success).toBe(false);
    expect(flexible.safeParse({ suggestions: [...three, dish("Fjärde rätten")] }).success).toBe(false);
    expect(suggestDishesAnswerCompactFor([]).safeParse({ suggestions: [three[0]] }).success).toBe(false);
  });

  it("rejects a step index that points past the steps", () => {
    const line = { ...validCompactDish.ingredients[0], stepIndexes: [5] };
    const broken = { ...three[1], ingredients: [line] };
    expect(issues({ suggestions: [three[0], broken, three[2]] })).toEqual([
      { path: ["suggestions", 1, "ingredients", 0, "stepIndexes", 0], message: "stepIndexes must point at an existing step" },
    ]);
  });

  it("has a JSON schema without minItems or maxItems over 1 on suggestions, so strict providers take it", () => {
    expect(z.toJSONSchema(suggestDishesAnswerCompactFor(["Pannkakor"]), { io: "input" })).toEqual(
      z.toJSONSchema(suggestDishesAnswerCompact, { io: "input" }),
    );
    const schema = z.toJSONSchema(suggestDishesAnswerCompact, { io: "input" }) as unknown as {
      properties: { suggestions: { type: string; minItems?: number; maxItems?: number } };
    };
    const { suggestions } = schema.properties;
    expect(suggestions.type).toBe("array");
    expect(suggestions.minItems ?? 0).toBeLessThanOrEqual(1);
    expect(suggestions.maxItems ?? 1).toBeLessThanOrEqual(1);
    expect(suggestions.maxItems).toBeUndefined();
  });
});

describe("compactDish (Story 12.3)", () => {
  const line = validCompactDish.ingredients[1];
  const withLine = (changed: Record<string, unknown>) => ({ ...validCompactDish, ingredients: [{ ...line, ...changed }] });

  it("accepts a dish with a line from the pantry (new null) and one outside it", () => {
    expect(compactDish.parse(validCompactDish)).toEqual(validCompactDish);
  });

  it.each([
    ["an unknown section", { new: { ...line.new, section: "Godis" } }, ["ingredients", 0, "new", "section"]],
    ["an unknown location", { new: { ...line.new, location: "Källare" } }, ["ingredients", 0, "new", "location"]],
    ["an unknown default unit", { new: { ...line.new, defaultUnit: "burk" } }, ["ingredients", 0, "new", "defaultUnit"]],
    ["new left out", { new: undefined }, ["ingredients", 0, "new"]],
    ["an empty name", { name: " " }, ["ingredients", 0, "name"]],
    ["an amount of 0", { amount: 0 }, ["ingredients", 0, "amount"]],
  ])("rejects %s", (_name, changed, path) => {
    const result = compactDish.safeParse(withLine(changed));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(path);
  });

  it("takes a unit as written, trimmed, and an empty one as none", () => {
    expect(compactDish.parse(withLine({ amount: 2, unit: " deciliter " })).ingredients[0].unit).toBe("deciliter");
    expect(compactDish.parse(withLine({ amount: 2, unit: " " })).ingredients[0].unit).toBeNull();
  });

  it("rejects a step index that points past the steps", () => {
    const result = compactDish.safeParse(withLine({ stepIndexes: [2] }));
    expect(result.error?.issues.map(({ path, message }) => ({ path, message }))).toEqual([
      { path: ["ingredients", 0, "stepIndexes", 0], message: "stepIndexes must point at an existing step" },
    ]);
  });

  it("has every property required, new nullable, and no isVague or hint, so strict providers take it", () => {
    const schema = z.toJSONSchema(compactDish, { io: "input" }) as unknown as {
      properties: { ingredients: { items: { required: string[]; properties: Record<string, { anyOf?: unknown[] }> } } };
    };
    const { items } = schema.properties.ingredients;
    expect(items.required).toEqual(["text", "amount", "unit", "name", "stepIndexes", "new"]);
    expect(Object.keys(items.properties)).toEqual(items.required);
    expect(JSON.stringify(items.properties.new)).toContain('"type":"null"');
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

  // Kylfoto B: the short form the model answers in.
  const short = { l: "Arla mellanmjölk", n: "mellanmjölk", q: 1, u: "förp", s: "Mejeri", p: [157, 230], a: null };

  it("takes any answer with a list of items of the right shape, also one with an item that will not pass", () => {
    const answer = { i: [short, { ...short, l: "", q: -1, p: [2000] }] };
    expect(analyzeImageAnswer.parse(answer)).toEqual(answer);
    expect(analyzeImageAnswer.parse({ i: [] })).toEqual({ i: [] });
  });

  it("refuses an answer that is broken as a whole: no list, or an item of the wrong shape", () => {
    expect(analyzeImageAnswer.safeParse({}).success).toBe(false);
    expect(analyzeImageAnswer.safeParse({ i: null }).success).toBe(false);
    expect(analyzeImageAnswer.safeParse({ i: [{ l: "Mjölk" }] }).success).toBe(false);
    expect(analyzeImageAnswer.safeParse({ i: [{ ...short, q: "1" }] }).success).toBe(false);
  });

  it("turns the short form into today's item, kept in the place of the photo, with its point (Kylfoto B)", () => {
    const result = parseAnalyzeItems([short, { ...short, l: "Ägg", n: "ägg", q: 6, u: "st", p: [291, 567] }], "Frys");
    expect(result).toEqual({
      items: [
        { ...item, hint: { ...item.hint, location: "Frys" }, point: { x: 157, y: 230 }, alternatives: [] },
        {
          label: "Ägg",
          confidence: "säker",
          amount: 6,
          unit: "st",
          hint: { name: "ägg", section: "Mejeri", location: "Frys", defaultUnit: "st" },
          point: { x: 291, y: 567 },
          alternatives: [],
        },
      ],
      invalid: 0,
      repeated: 0,
    });
  });

  it("makes an item with a list of other names unsure, keeps at most two of them, and reads `o` from a lenient model", () => {
    const [guess, empty, flagged] = parseAnalyzeItems(
      [
        { ...short, l: "Gul flaska", n: "senap", a: [" dijonsenap ", "Senap", "", 3, "dijonsenap", "ketchup", "majonnäs"] },
        { ...short, l: "Burk", n: "sylt", a: [] },
        { ...short, l: "Påse", n: "ost", a: null, o: 1 },
      ],
      "Kyl",
    ).items;
    expect([guess.confidence, guess.alternatives]).toEqual(["osäker", ["dijonsenap", "ketchup"]]);
    expect([empty.confidence, empty.alternatives]).toEqual(["osäker", []]);
    expect([flagged.confidence, flagged.alternatives]).toEqual(["osäker", []]);
  });

  it("leaves out a point that is not two numbers on the photo, never the item", () => {
    const points = [null, [500], [500, 500, 500], [-30, 10], [10, 1030], ["5", 5], [0, 1000], [Number.NaN, 5]].map(
      (p) => parseAnalyzeItems([{ ...short, p }], "Kyl").items[0].point,
    );
    expect(points).toEqual([null, null, null, null, null, null, { x: 0, y: 1000 }, null]);
  });

  // Kylfoto: why few items had numbers: a point a little outside 0–1000, in fractions or in pixels was left out.
  it("keeps a point a little past the edge on the edge, and rounds it", () => {
    const points = [[-1, 10], [10, 1001], [1020.4, 499.6]].map((p) => parseAnalyzeItems([{ ...short, p }], "Kyl").items[0].point);
    expect(points).toEqual([{ x: 0, y: 10 }, { x: 10, y: 1000 }, { x: 1000, y: 500 }]);
  });

  it("reads the middle of a box [x1, y1, x2, y2]", () => {
    expect(parseAnalyzeItems([{ ...short, p: [100, 200, 300, 400] }], "Kyl").items[0].point).toEqual({ x: 200, y: 300 });
  });

  it("reads an answer in fractions (0–1) as thousandths, judged from all its points", () => {
    const answer = [
      { ...short, p: [0.25, 0.5] },
      { ...short, l: "Ägg", n: "ägg", p: [1, 0] },
    ];
    expect(parseAnalyzeItems(answer, "Kyl").items.map((item) => item.point)).toEqual([
      { x: 250, y: 500 },
      { x: 1000, y: 0 },
    ]);
    // Whole numbers 0 and 1 alone are thousandths, as asked.
    expect(parseAnalyzeItems([{ ...short, p: [1, 1] }], "Kyl").items[0].point).toEqual({ x: 1, y: 1 });
  });

  it("reads an answer in the photo's pixels as thousandths when its points are past 1000 and fit the photo", () => {
    const answer = [
      { ...short, p: [1536, 300] },
      { ...short, l: "Ägg", n: "ägg", p: [512, 1152] },
    ];
    const size = { width: 2048, height: 1536 };
    expect(parseAnalyzeItems(answer, "Kyl", size).items.map((item) => item.point)).toEqual([
      { x: 750, y: 195 },
      { x: 250, y: 750 },
    ]);
    // Without the photo's size, or past it, they cannot be read, and are left out.
    expect(parseAnalyzeItems(answer, "Kyl").items.map((item) => item.point)).toEqual([null, null]);
    expect(parseAnalyzeItems(answer, "Kyl", { width: 800, height: 600 }).items.map((item) => item.point)).toEqual([null, null]);
  });

  it("judges the scale of an answer from all its points (pointScale)", () => {
    expect(pointScale([])).toEqual({ x: 1, y: 1 });
    expect(pointScale([null, { x: 500, y: 500 }])).toEqual({ x: 1, y: 1 });
    expect(pointScale([{ x: 0.5, y: 0.5 }])).toEqual({ x: 1000, y: 1000 });
    expect(pointScale([{ x: 2000, y: 100 }], { width: 2000, height: 1000 })).toEqual({ x: 0.5, y: 1 });
  });

  it("gives an item without a unit no catalog unit, and refuses one without a label, a name or a section", () => {
    const [plain] = parseAnalyzeItems([{ ...short, q: null, u: null }], "Kyl").items;
    expect([plain.amount, plain.unit, plain.hint.defaultUnit]).toEqual([null, null, ""]);
    const result = parseAnalyzeItems([{ ...short, l: " " }, { ...short, n: "" }, { ...short, s: null }, { ...short, q: -1 }], "Kyl");
    expect(result).toEqual({ items: [], invalid: 4, repeated: 0 });
  });

  it("merges copies in the short form into the first, with its point", () => {
    const result = parseAnalyzeItems([short, { ...short, p: [900, 900] }, { ...short, p: [10, 10] }], "Kyl");
    expect(result.items.map(({ label, point }) => [label, point])).toEqual([["Arla mellanmjölk", { x: 157, y: 230 }]]);
    expect(result.repeated).toBe(2);
  });

  it("still reads the long form of before, without a point, also next to the short form", () => {
    const result = parseAnalyzeItems([item, { ...short, l: "Smör", n: "smör" }], "Kyl");
    expect(result.items.map(({ label, point, alternatives }) => [label, point, alternatives])).toEqual([
      ["Arla mellanmjölk", null, []],
      ["Smör", { x: 157, y: 230 }, []],
    ]);
    expect(result.invalid).toBe(0);
  });

  it("checks each item on its own: valid ones in order, and a count of the others", () => {
    const smor = { ...item, label: "Smör" };
    const result = parseAnalyzeItems([item, { ...item, label: " " }, "inte en vara", smor, { ...item, amount: -1 }], "Kyl");
    expect(result.items.map(({ label }) => label)).toEqual(["Arla mellanmjölk", "Smör"]);
    expect(result.invalid).toBe(3);
    expect(parseAnalyzeItems([], "Kyl")).toEqual({ items: [], invalid: 0, repeated: 0 });
  });

  it("merges a loop into its first copy without adding the amounts, and counts the most repeats of one label (Story 6.5)", () => {
    const gradde = { ...item, label: "Grädde", hint: { ...item.hint, name: "grädde" } };
    // Near copies: the same label with an amount and unit, or a full stop, are the same label.
    const loop = [gradde, ...Array.from({ length: 10 }, () => gradde), { ...gradde, label: "Grädde 3 dl" }, { ...gradde, label: "grädde." }];
    const result = parseAnalyzeItems([item, ...loop, { ...item, label: "Ägg", amount: 6, unit: "st" }], "Kyl");
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
    ], "Kyl");
    expect(result.items.map(({ label, amount, unit, confidence }) => [label, amount, unit, confidence])).toEqual([
      ["Arla mellanmjölk", 3, "förp", "osäker"],
      // Different units are not added: the first copy's amount.
      ["Ägg", 6, "st", "säker"],
    ]);
    expect(result.repeated).toBe(1);
  });

  it("takes the first amount in a loop when the first copy has none, and is unsure when any copy is", () => {
    const smor = { ...item, label: "Smör", amount: null, unit: null };
    const result = parseAnalyzeItems([smor, { ...smor, amount: 2, unit: "förp", confidence: "osäker" }, { ...smor, amount: 3, unit: "förp" }], "Kyl");
    expect(result.items).toEqual([{ ...smor, amount: 2, unit: "förp", confidence: "osäker", point: null, alternatives: [] }]);
    expect(result.repeated).toBe(2);
  });

  it("does not count an invalid item as seen: a valid one with its label comes through", () => {
    const result = parseAnalyzeItems([{ ...item, amount: -1 }, item], "Kyl");
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
    const result = parseAnalyzeItems(answer.items, "Kyl");
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

  it("has a JSON schema with every short field required, no minItems or maxItems on items, and no defaults", () => {
    const schema = z.toJSONSchema(analyzeImageAnswer, { io: "input" }) as unknown as {
      required: string[];
      properties: { i: { type: string; minItems?: number; maxItems?: number; items: { required: string[]; properties: object } } };
    };
    expect(schema.required).toEqual(["i"]);
    const { i: items } = schema.properties;
    expect(items.type).toBe("array");
    expect(items.minItems).toBeUndefined();
    expect(items.maxItems).toBeUndefined();
    expect(items.items.required).toEqual(["l", "n", "q", "u", "s", "p", "a"]);
    expect(Object.keys(items.items.properties)).toEqual(items.items.required);
    expect(JSON.stringify(schema)).not.toMatch(/"default"|"minLength"|"maxLength"|"minimum"|"exclusiveMinimum"/);
  });
});

describe("parseOfferMatches (Story 9.10)", () => {
  const answer = (matches: { offer: number; ingredient: number | null }[]) => matchOffersAnswer.parse({ matches });

  it("gives zero-based pairs for the offers that have an ingredient", () => {
    expect(parseOfferMatches(answer([{ offer: 1, ingredient: 3 }, { offer: 2, ingredient: null }, { offer: 3, ingredient: 1 }]), 3, 3)).toEqual([
      { offer: 0, ingredient: 2 },
      { offer: 2, ingredient: 0 },
    ]);
  });

  it("leaves out numbers outside the lists, numbers that are not whole and an offer answered twice", () => {
    const pairs = parseOfferMatches(
      answer([
        { offer: 1, ingredient: 4 },
        { offer: 1, ingredient: 1 },
        { offer: 0, ingredient: 1 },
        { offer: 4, ingredient: 1 },
        { offer: 2, ingredient: 1.5 },
        { offer: 2, ingredient: 2 },
      ]),
      3,
      3,
    );
    // Offer 1's first answer was out of range and still used the offer up; offer 2's first answer was not whole.
    expect(pairs).toEqual([]);
  });
});

describe("shoppingListAnswer and parseShoppingList (Fota en lista)", () => {
  const parse = (items: unknown[]) => parseShoppingList(shoppingListAnswer.parse({ items }));

  it("needs every property, so strict providers can decode it", () => {
    expect(shoppingListAnswer.safeParse({ items: [{ name: "Mjölk" }] }).success).toBe(false);
    expect(shoppingListAnswer.safeParse({}).success).toBe(false);
    expect(shoppingListAnswer.safeParse({ items: [] }).success).toBe(true);
  });

  it("cleans each name, drops empty lines and keeps a name once", () => {
    const result = parse([
      { name: "  Mjölk\n", amount: null, unit: null },
      { name: "mjölk", amount: null, unit: null },
      { name: "   ", amount: null, unit: null },
      { name: "Bröd", amount: null, unit: null },
    ]);
    expect(result).toEqual({
      items: [
        { name: "Mjölk", amount: null, unit: null },
        { name: "Bröd", amount: null, unit: null },
      ],
      invalid: 1,
      trimmed: 0,
    });
  });

  it("keeps an amount only with a unit and as a positive number below a million", () => {
    const result = parse([
      { name: "Mjölk", amount: 2, unit: " l " },
      { name: "Ägg", amount: 6, unit: null },
      { name: "Smör", amount: 0, unit: "g" },
      { name: "Salt", amount: -1, unit: "g" },
      { name: "Ris", amount: 2_000_000, unit: "g" },
      { name: "Kaffe", amount: null, unit: "g" },
    ]);
    expect(result.items).toEqual([
      { name: "Mjölk", amount: 2, unit: "l" },
      { name: "Ägg", amount: null, unit: null },
      { name: "Smör", amount: null, unit: null },
      { name: "Salt", amount: null, unit: null },
      { name: "Ris", amount: null, unit: null },
      { name: "Kaffe", amount: null, unit: null },
    ]);
  });

  it("keeps the first maxListItems and counts the rest as trimmed", () => {
    const items = Array.from({ length: maxListItems + 5 }, (_, index) => ({ name: `Vara ${index}`, amount: null, unit: null }));
    const result = parse(items);
    expect(result.items).toHaveLength(maxListItems);
    expect(result.trimmed).toBe(5);
  });
});

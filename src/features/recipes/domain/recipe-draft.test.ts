import { describe, expect, it } from "vitest";
import { draftFieldMessages, draftLimits, recipeDraftSchema, validateDraft, type RecipeDraft } from "./recipe-draft";

const id = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";

const draft = (overrides: Partial<RecipeDraft> = {}): RecipeDraft => ({
  title: "Soppa",
  servings: 4,
  totalMinutes: null,
  imageUrl: null,
  sourceKind: "text",
  sourceUrl: null,
  steps: ["Koka."],
  lines: [
    {
      originalText: "2 dl grädde",
      amount: 2,
      unit: "dl",
      isVague: false,
      ingredient: { kind: "match", ingredientId: id, confidence: "hint" },
      stepIndexes: [0],
    },
  ],
  ...overrides,
});

const line = draft().lines[0];

describe("recipeDraftSchema", () => {
  it("accepts a draft with every kind of ingredient", () => {
    const lines: RecipeDraft["lines"] = [
      line,
      { ...line, ingredient: { kind: "chosen", ingredientId: id } },
      {
        ...line,
        ingredient: { kind: "new", proposal: { name: "Grädde", section: "Mejeri", location: "Kyl", defaultUnit: "dl" } },
      },
      { ...line, ingredient: { kind: "unmatched" } },
      { ...line, amount: null, unit: null, isVague: true, stepIndexes: [] },
      { ...line, hint: { name: "grädde", section: "Mejeri", location: "Kyl", defaultUnit: "dl" } },
    ];
    expect(recipeDraftSchema.safeParse(draft({ lines })).success).toBe(true);
  });

  it("accepts a link with its source URL and image", () => {
    const fromUrl = draft({
      sourceKind: "url",
      sourceUrl: "https://www.koket.se/soppa",
      imageUrl: "https://www.koket.se/soppa.jpg",
    });
    expect(recipeDraftSchema.safeParse(fromUrl).success).toBe(true);
  });

  it.each([
    ["an empty title", draft({ title: "  " })],
    ["0 servings", draft({ servings: 0 })],
    ["negative time", draft({ totalMinutes: -5 })],
    ["an unknown source", { ...draft(), sourceKind: "email" }],
    ["a link without source URL", draft({ sourceKind: "url" })],
    ["a source URL for text", draft({ sourceUrl: "https://www.koket.se/soppa" })],
    ["a source URL that is not http(s)", draft({ sourceKind: "url", sourceUrl: "javascript:alert(1)" })],
    ["an image that is not http(s)", draft({ imageUrl: "data:image/png;base64,AAAA" })],
    ["an empty step", draft({ steps: ["Koka.", " "] })],
    ["a unit outside UNITS", draft({ lines: [{ ...line, unit: "näve" as never }] })],
    ["a vague line with an amount", draft({ lines: [{ ...line, isVague: true }] })],
    ["a line without amount that is not vague", draft({ lines: [{ ...line, amount: null, unit: null }] })],
    ["a line without amount that has a unit", draft({ lines: [{ ...line, amount: null, isVague: true }] })],
    ["a zero amount", draft({ lines: [{ ...line, amount: 0 }] })],
    ["a step index past the last step", draft({ lines: [{ ...line, stepIndexes: [1] }] })],
    ["a chosen ingredient without id", draft({ lines: [{ ...line, ingredient: { kind: "chosen" } as never }] })],
    ["a title over the limit", draft({ title: "a".repeat(draftLimits.titleChars + 1) })],
    ["a step over the limit", draft({ steps: ["a".repeat(draftLimits.stepChars + 1)] })],
    ["too many steps", draft({ steps: Array.from({ length: draftLimits.steps + 1 }, () => "Koka.") })],
    ["an original text over the limit", draft({ lines: [{ ...line, originalText: "a".repeat(draftLimits.originalTextChars + 1) }] })],
    ["too many lines", draft({ lines: Array.from({ length: draftLimits.lines + 1 }, () => line) })],
    ["an image address over the limit", draft({ imageUrl: `https://koket.se/${"a".repeat(draftLimits.urlChars)}` })],
  ])("rejects %s", (_name, value) => {
    expect(recipeDraftSchema.safeParse(value).success).toBe(false);
  });

  it("accepts a draft at every limit", () => {
    const atLimit = draft({
      title: "a".repeat(draftLimits.titleChars),
      steps: Array.from({ length: draftLimits.steps }, () => "a".repeat(draftLimits.stepChars)),
      lines: Array.from({ length: draftLimits.lines }, () => ({ ...line, originalText: "a".repeat(draftLimits.originalTextChars) })),
      imageUrl: `https://k.se/${"a".repeat(draftLimits.urlChars - "https://k.se/".length)}`,
    });
    expect(recipeDraftSchema.safeParse(atLimit).success).toBe(true);
  });
});

describe("validateDraft", () => {
  it("finds nothing wrong in a valid draft", () => {
    expect(validateDraft(draft())).toEqual({});
  });

  it("asks for a title and for text in every step", () => {
    expect(validateDraft(draft({ title: " ", steps: ["Koka.", "  "] }))).toEqual({
      title: draftFieldMessages.title,
      "steps.1": draftFieldMessages.step,
    });
  });

  it("asks for a number where typed text did not become one", () => {
    expect(validateDraft(draft(), { totalMinutes: "en halvtimme", amounts: { 0: "abc" } })).toEqual({
      totalMinutes: draftFieldMessages.number,
      "lines.0.amount": draftFieldMessages.number,
    });
  });

  it("reports anything else the schema rejects by its path", () => {
    expect(validateDraft(draft({ servings: 0 }))).toEqual({ servings: draftFieldMessages.other });
  });
});

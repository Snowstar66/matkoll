import { describe, expect, it } from "vitest";
import { aiRecipe, parseRecipeAnswer } from "./schemas";
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

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aiRecipe, parseRecipeAnswer, suggestDishesAnswer, suggestDishesAnswerFor } from "./schemas";
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

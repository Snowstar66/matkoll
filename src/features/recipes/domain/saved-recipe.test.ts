import { describe, expect, it } from "vitest";
import { fromAiRecipe } from "./from-ai-recipe";
import type { RecipeDraft } from "./recipe-draft";
import { toSaveRecipeArgs } from "./saved-recipe";

const onion = "11111111-1111-4111-8111-111111111111";
const salt = "22222222-2222-4222-8222-222222222222";
const recipeId = "33333333-3333-4333-8333-333333333333";

const draft: RecipeDraft = {
  title: "  Linssoppa ",
  servings: 4,
  totalMinutes: 30,
  imageUrl: null,
  sourceKind: "url",
  sourceUrl: "https://www.koket.se/linssoppa",
  steps: [" Hacka löken.", "Koka allt."],
  lines: [
    {
      originalText: "1 gul lök",
      amount: 1,
      unit: "st",
      isVague: false,
      ingredient: { kind: "match", ingredientId: onion, confidence: "exact" },
      stepIndexes: [1, 0],
    },
    {
      originalText: "salt efter smak",
      amount: null,
      unit: null,
      isVague: true,
      ingredient: { kind: "chosen", ingredientId: salt },
      stepIndexes: [],
    },
    {
      originalText: "något gott",
      amount: null,
      unit: null,
      isVague: true,
      ingredient: { kind: "unmatched" },
      stepIndexes: [1],
    },
  ],
};

describe("toSaveRecipeArgs", () => {
  it("maps the draft to the rows of save_recipe, in order", () => {
    expect(toSaveRecipeArgs(recipeId, draft, [onion, salt, null])).toEqual({
      recipe: {
        id: recipeId,
        title: "Linssoppa",
        original_servings: 4,
        total_minutes: 30,
        image_url: null,
        source_kind: "url",
        source_url: "https://www.koket.se/linssoppa",
        offer_names: [],
      },
      steps: [
        { position: 0, text: "Hacka löken." },
        { position: 1, text: "Koka allt." },
      ],
      lines: [
        {
          position: 0,
          original_text: "1 gul lök",
          amount: 1,
          unit: "st",
          is_vague: false,
          ingredient_id: onion,
          step_position: 0,
        },
        {
          position: 1,
          original_text: "salt efter smak",
          amount: null,
          unit: null,
          is_vague: true,
          ingredient_id: salt,
          step_position: null,
        },
        {
          position: 2,
          original_text: "något gott",
          amount: null,
          unit: null,
          is_vague: true,
          ingredient_id: null,
          step_position: 1,
        },
      ],
    });
  });

  it("needs one ingredient id per line", () => {
    expect(() => toSaveRecipeArgs(recipeId, draft, [onion])).toThrow();
  });
});

describe("a saved AI suggestion (Story 16.4)", () => {
  // The suggestion's path to the database keeps what makes it a recipe:
  // steps, time, portions and the offers it was built around.
  const suggestion = fromAiRecipe(
    {
      title: "Falukorv med stuvad potatis",
      servings: 4,
      totalMinutes: 35,
      ingredients: [
        { originalText: "1 paket falukorv", amount: 1, unit: "st", isVague: false, stepIndexes: [1] },
        { originalText: "salt", amount: null, unit: null, isVague: true, stepIndexes: [0] },
      ],
      steps: ["Koka potatisen.", "Stek korven.", "Servera."],
    },
    [
      { kind: "match", ingredientId: onion, confidence: "exact" },
      { kind: "match", ingredientId: salt, confidence: "exact" },
    ],
    { kind: "ai" },
  );

  it("writes every step in order, the time, the portions and the offers", () => {
    const args = toSaveRecipeArgs(recipeId, { ...suggestion, offerNames: ["falukorv", "ketchup"] }, [onion, salt]);
    expect(args.steps).toEqual([
      { position: 0, text: "Koka potatisen." },
      { position: 1, text: "Stek korven." },
      { position: 2, text: "Servera." },
    ]);
    expect(args.recipe).toMatchObject({
      original_servings: 4,
      total_minutes: 35,
      source_kind: "ai",
      offer_names: ["falukorv", "ketchup"],
    });
  });

  it("has no offers for a suggestion from the pantry", () => {
    expect(toSaveRecipeArgs(recipeId, suggestion, [onion, salt]).recipe.offer_names).toEqual([]);
  });
});

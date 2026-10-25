import { describe, expect, it } from "vitest";
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

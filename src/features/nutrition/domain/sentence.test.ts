import { describe, expect, it } from "vitest";
import { KOSTRAD_GROUPS, type KostradGroup } from "./groups";
import type { RecipeNutrition } from "./recipe-nutrition";
import { MEAL_REFERENCE, shareOfReference } from "./reference";
import { nutritionSentence } from "./sentence";

function dish(perServing: RecipeNutrition["perServing"], plate: RecipeNutrition["plateGrams"], coverage: RecipeNutrition["coverage"] = { counted: 9, total: 10 }): RecipeNutrition {
  return {
    perServing,
    gramsPerServing: 300,
    groupGrams: Object.fromEntries(KOSTRAD_GROUPS.map((g) => [g, 0])) as Record<KostradGroup, number>,
    plateGrams: plate,
    coverage,
    uncounted: [],
    portionEstimates: [],
    negligible: [],
  };
}

const curry = dish({ kcal: 750, proteinG: 35, fatG: 38, carbsG: 65, fiberG: 4 }, { gronsaker: 60, protein: 75, kolhydrater: 150 });
const kladdkaka = dish({ kcal: 450, proteinG: 6, fatG: 24, carbsG: 52, fiberG: 2 }, { gronsaker: 0, protein: 0, kolhydrater: 20 });

describe("nutritionSentence", () => {
  it("describes the Thai curry", () => {
    expect(nutritionSentence(curry)).toBe("Mycket protein och fett, lite grönsaker och fibrer.");
  });
  it("describes the kladdkaka from energy shares and plate data only", () => {
    expect(nutritionSentence(kladdkaka)).toBe("Mest kolhydrater och fett, inga grönsaker och lite fibrer.");
  });
  it("is positive about plenty of vegetables and fibre, with no lead", () => {
    const d = dish({ kcal: 400, proteinG: 20, fatG: 12, carbsG: 50, fiberG: 12 }, { gronsaker: 300, protein: 100, kolhydrater: 100 });
    expect(nutritionSentence(d)).toBe("Gott om grönsaker och fibrer.");
  });
  it("returns null when nothing stands out", () => {
    const d = dish({ kcal: 500, proteinG: 25, fatG: 18, carbsG: 60, fiberG: 7 }, { gronsaker: 100, protein: 80, kolhydrater: 120 });
    expect(nutritionSentence(d)).toBeNull();
  });
  it("returns null for untrustworthy coverage and for very small kcal", () => {
    expect(nutritionSentence({ ...curry, coverage: { counted: 3, total: 10 } })).toBeNull();
    expect(nutritionSentence({ ...curry, perServing: { ...curry.perServing, kcal: 50 } })).toBeNull();
  });
  it("never uses judging words", () => {
    for (const d of [curry, kladdkaka]) expect(nutritionSentence(d)).not.toMatch(/hälsosam|nyttig|dålig|bra|ssocker|mättat/i);
  });
});

describe("meal reference", () => {
  it("is a third of a 2000 kcal day", () => {
    expect(MEAL_REFERENCE.kcal).toBe(667);
    expect(Math.round(shareOfReference(35, MEAL_REFERENCE.proteinG) * 100)).toBe(140);
    expect(Math.round(shareOfReference(750, MEAL_REFERENCE.kcal) * 100)).toBe(112);
  });
});

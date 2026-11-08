import { describe, expect, it } from "vitest";
import { food, line, per } from "./fixtures";
import { plateRole, recipeNutrition, roundedGrams, roundedKcal } from "./recipe-nutrition";

const rows = {
  pasta: food("pasta", "raffinerad", per(358, 12, 1.3, 71.5, 4), { gramsPerDl: 40 }),
  beef: food("nötfärs", "rott_kott", per(200, 20, 14, 0, 0)),
  tomato: food("krossade tomater", "gronsak", per(22, 0.8, 0.2, 3.7, 1.2), { gramsPerDl: 100 }),
  salt: food("salt", "ej_raknad", null, { lmvNumber: null }),
  tofu: food("tofu", "baljvaxt", per(70, 6.6, 4.2, 1.2, 0.4), { lmvNumber: 905 }),
  lentils: food("linser", "baljvaxt", per(339, 24, 1, 52, 10), { lmvNumber: 884, gramsPerDl: 80 }),
  cheese: food("ost", "mejeri", per(358, 26, 27, 3, 0), { gramsPerDl: 40 }),
};

describe("recipeNutrition", () => {
  it("divides the totals by the servings", () => {
    const result = recipeNutrition([line("pasta", 400, "g"), line("beef", 400, "g"), line("tomato", 4, "dl")], rows, 4);
    // kcal: 400*3.58 + 400*2 + 400*0.22 = 1432 + 800 + 88 = 2320, so 580 per portion
    expect(result.perServing.kcal).toBeCloseTo(580);
    expect(result.perServing.proteinG).toBeCloseTo((48 + 80 + 3.2) / 4);
    expect(result.perServing.fatG).toBeCloseTo((5.2 + 56 + 0.8) / 4);
    expect(result.perServing.carbsG).toBeCloseTo((286 + 0 + 14.8) / 4);
    expect(result.perServing.fiberG).toBeCloseTo((16 + 0 + 4.8) / 4);
    expect(result.gramsPerServing).toBe(300);
    expect(result.groupGrams.raffinerad).toBe(100);
    expect(result.groupGrams.rott_kott).toBe(100);
    expect(result.groupGrams.gronsak).toBe(100);
    expect(result.coverage).toEqual({ counted: 3, total: 3 });
  });

  it("leaves out ingredients that never count from both numbers", () => {
    const result = recipeNutrition([line("pasta", 100, "g"), line("salt", 1, "tsk")], rows, 1);
    expect(result.coverage).toEqual({ counted: 1, total: 1 });
  });

  it("leaves out a vague line with no amount, with or without an ingredient", () => {
    const result = recipeNutrition([line("pasta", 100, "g"), line(null, null, null, true), line("beef", null, null, true)], rows, 1);
    expect(result.coverage).toEqual({ counted: 1, total: 1 });
  });

  it("does not count lines it cannot weigh, but keeps them in the total", () => {
    const result = recipeNutrition(
      [
        line("pasta", 100, "g"),
        line(null, 2, "dl"), // no catalog ingredient
        line("beef", 1, "förp"), // size unknown
        line("beef", null, null), // no amount, not vague
        line("unknown-id", 100, "g"), // no nutrition row
        line("pasta", 1, "st"), // no piece weight
        line("pasta", 2, "skiva"), // no slice weight
      ],
      rows,
      1,
    );
    expect(result.coverage).toEqual({ counted: 1, total: 7 });
    expect(result.gramsPerServing).toBe(100);
  });

  it("counts a vague line that has an ingredient and an amount", () => {
    const result = recipeNutrition([line("pasta", 100, "g", true)], rows, 1);
    expect(result.coverage).toEqual({ counted: 1, total: 1 });
  });

  it("takes servings that are not positive as 1", () => {
    for (const servings of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(recipeNutrition([line("pasta", 100, "g")], rows, servings).gramsPerServing).toBe(100);
    }
  });

  it("handles no lines", () => {
    const result = recipeNutrition([], rows, 4);
    expect(result.coverage).toEqual({ counted: 0, total: 0 });
    expect(result.perServing.kcal).toBe(0);
  });

  it("sums the same ingredient on several lines", () => {
    const result = recipeNutrition([line("pasta", 100, "g"), line("pasta", 100, "g")], rows, 2);
    expect(result.groupGrams.raffinerad).toBe(100);
  });

  it("ignores ids that are properties of Object", () => {
    expect(recipeNutrition([line("constructor", 100, "g")], rows, 1).coverage).toEqual({ counted: 0, total: 1 });
  });

  it("puts tofu on the plate as protein and other pulses as vegetables", () => {
    const result = recipeNutrition([line("tofu", 200, "g"), line("lentils", 1, "dl"), line("cheese", 100, "g")], rows, 1);
    expect(result.plateGrams).toEqual({ gronsaker: 80, kolhydrater: 0, protein: 200 });
    expect(result.groupGrams.baljvaxt).toBe(280);
    expect(result.groupGrams.mejeri).toBe(100);
  });
});

describe("plateRole", () => {
  it("maps groups to the plate", () => {
    expect(plateRole(rows.pasta)).toBe("kolhydrater");
    expect(plateRole(rows.beef)).toBe("protein");
    expect(plateRole(rows.tomato)).toBe("gronsaker");
    expect(plateRole(rows.cheese)).toBeNull();
    expect(plateRole(rows.salt)).toBeNull();
    expect(plateRole(food("olja", "fett", per(884)))).toBeNull();
    expect(plateRole(food("fullkornsris", "fullkorn", per(365)))).toBe("kolhydrater");
    expect(plateRole(food("ägg", "agg", per(136)))).toBe("protein");
  });
});

describe("rounding", () => {
  it("rounds kcal to 10 and grams to 1", () => {
    expect(roundedKcal(543)).toBe(540);
    expect(roundedKcal(545)).toBe(550);
    expect(roundedGrams(12.4)).toBe(12);
    expect(roundedGrams(12.5)).toBe(13);
  });
});

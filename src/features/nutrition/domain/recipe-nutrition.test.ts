import { describe, expect, it } from "vitest";
import { food, line, per } from "./fixtures";
import { isTrustworthy, plateRole, recipeNutrition, roundedGrams, roundedKcal, TRUST_MAX_UNCOUNTED_WEIGHT, TRUST_MIN_COVERAGE } from "./recipe-nutrition";

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
    expect(result.coverage).toMatchObject({ counted: 3, total: 3 });
  });

  it("leaves out ingredients that never count from both numbers", () => {
    const result = recipeNutrition([line("pasta", 100, "g"), line("salt", 1, "tsk")], rows, 1);
    expect(result.coverage).toMatchObject({ counted: 1, total: 1 });
  });

  it("leaves out a vague line with no amount, with or without an ingredient", () => {
    const result = recipeNutrition([line("pasta", 100, "g"), line(null, null, null, true), line("beef", null, null, true)], rows, 1);
    expect(result.coverage).toMatchObject({ counted: 1, total: 1 });
  });

  it("does not count lines it cannot weigh, but keeps them in the total", () => {
    const result = recipeNutrition(
      [
        line("pasta", 100, "g"),
        line(null, 2, "dl"), // no catalog ingredient
        line("beef", 1, "kvist"), // unit unknown
        line("beef", null, null), // no amount, not vague
        line("unknown-id", 100, "g"), // no nutrition row
        line("pasta", 1, "st"), // no piece weight: guessed
        line("pasta", 2, "skiva"), // no slice weight: guessed
      ],
      rows,
      1,
    );
    expect(result.coverage).toMatchObject({ counted: 3, total: 7, estimated: 2 });
    expect(result.gramsPerServing).toBe(100 + 80 + 60);
    expect(result.uncounted).toHaveLength(4);
  });

  it("guesses the weight of slices of meat: 12 slices for 4 people is about 100 g each", () => {
    const result = recipeNutrition([line("beef", 12, "skivor")], rows, 4);
    expect(result.gramsPerServing).toBeCloseTo(99);
    expect(result.coverage).toMatchObject({ counted: 1, total: 1, estimated: 1 });
  });

  it("counts a vague line that has an ingredient and an amount", () => {
    const result = recipeNutrition([line("pasta", 100, "g", true)], rows, 1);
    expect(result.coverage).toMatchObject({ counted: 1, total: 1 });
  });

  it("takes servings that are not positive as 1", () => {
    for (const servings of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(recipeNutrition([line("pasta", 100, "g")], rows, servings).gramsPerServing).toBe(100);
    }
  });

  it("handles no lines", () => {
    const result = recipeNutrition([], rows, 4);
    expect(result.coverage).toMatchObject({ counted: 0, total: 0 });
    expect(result.perServing.kcal).toBe(0);
  });

  it("sums the same ingredient on several lines", () => {
    const result = recipeNutrition([line("pasta", 100, "g"), line("pasta", 100, "g")], rows, 2);
    expect(result.groupGrams.raffinerad).toBe(100);
  });

  it("ignores ids that are properties of Object", () => {
    expect(recipeNutrition([line("constructor", 100, "g")], rows, 1).coverage).toMatchObject({ counted: 0, total: 1 });
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

describe("uncounted lines and the trust gate", () => {
  it("names the lines it could not count and why", () => {
    const result = recipeNutrition(
      [
        { ...line(null, 600, "g"), ingredientName: "fransyska", originalText: "600 g fransyska" },
        { ...line("beef", 1, "kvist"), ingredientName: "Nötfärs", originalText: "1 kvist nötfärs" },
        { ...line(null, null, null), originalText: "något gott" },
      ],
      rows,
      2,
    );
    expect(result.uncounted).toEqual([
      { label: "fransyska", reason: "unknown_ingredient", name: "fransyska", unit: "g" },
      { label: "nötfärs (1 kvist)", reason: "unknown_unit", name: "nötfärs", unit: "kvist" },
      { label: "något gott", reason: "unknown_ingredient", name: null, unit: null },
    ]);
  });

  it("trusts kcal from 80 % of the countable lines", () => {
    expect(TRUST_MIN_COVERAGE).toBe(0.8);
    expect(isTrustworthy({ counted: 4, total: 5 })).toBe(true);
    expect(isTrustworthy({ counted: 3, total: 5 })).toBe(false);
    expect(isTrustworthy({ counted: 0, total: 0 })).toBe(false);
  });
});

describe("Biff Rydberg for 4", () => {
  // LMV values per 100 g as in the nutrition table.
  const biff = {
    fransyska: food("fransyska", "rott_kott", per(116, 20.8, 3.5)),
    potatis: food("potatis", "raffinerad", per(76, 1.8, 0.1, 16.5, 1.6), { gramsPerPiece: 90, gramsPerDl: 90 }),
    lok: food("gul lök", "gronsak", per(39, 1.2, 0.1, 7.3, 1.9), { gramsPerPiece: 110, gramsPerDl: 60 }),
    smor: food("smör", "fett", per(766, 0.6, 86.3), { gramsPerDl: 95 }),
    olja: food("rapsolja", "fett", per(884, 0, 100), { gramsPerDl: 90 }),
    aggula: food("äggula", "agg", per(325, 16, 28, 0.3), { gramsPerPiece: 18 }),
    yoghurt: food("turkisk yoghurt", "mejeri", per(109, 3.6, 8.3, 5.2), { gramsPerDl: 103 }),
    senap: food("dijonsenap", "ovrigt", per(100, 6, 5, 6, 3), { gramsPerDl: 100 }),
    persilja: food("persilja", "gronsak", per(50, 3, 0.8, 5, 3), { gramsPerDl: 15 }),
    salt: food("salt", "ej_raknad", null, { lmvNumber: null }),
  };
  const lines = [
    line("fransyska", 600, "g"),
    line("potatis", 800, "g"),
    line("lok", 2, "st"),
    line("smor", 50, "g"),
    line("olja", 2, "msk"),
    line("aggula", 4, "st"),
    line("yoghurt", 2, "dl"),
    line("senap", 2, "msk"),
    line("persilja", null, null, true),
    line("salt", null, null, true),
  ];

  it("lands in a realistic range with the kcal gate open", () => {
    const result = recipeNutrition(lines, biff, 4);
    expect(isTrustworthy(result.coverage)).toBe(true);
    expect(result.uncounted).toEqual([]);
    expect(result.perServing.kcal).toBeGreaterThan(550);
    expect(result.perServing.kcal).toBeLessThan(800);
  });

  it("closes the gate when 600 g of unknown meat is missing, though 7 of 8 lines are counted", () => {
    const withUnknown = lines.map((l) => (l.ingredientId === "fransyska" ? { ...line("okand", 600, "g"), ingredientName: "nötinnanlårsbit" } : l));
    const result = recipeNutrition(withUnknown, biff, 4);
    expect(result.coverage.counted / result.coverage.total).toBeGreaterThanOrEqual(0.8);
    expect(isTrustworthy(result.coverage)).toBe(false);
    expect(result.uncounted).toEqual([{ label: "nötinnanlårsbit", reason: "unknown_ingredient", name: "nötinnanlårsbit", unit: "g" }]);
  });

  it("stays open when a 1 förp line or a tsk line is missing", () => {
    for (const extra of [line("okand", 1, "förp"), line("okand", 1, "tsk")]) {
      const result = recipeNutrition([...lines, extra, line("senap", 1, "tsk")], biff, 4);
      expect(result.coverage.counted / result.coverage.total).toBeGreaterThanOrEqual(0.8);
      expect(isTrustworthy(result.coverage)).toBe(true);
    }
  });

  it("has the weight limit at 15 %", () => {
    expect(TRUST_MAX_UNCOUNTED_WEIGHT).toBe(0.15);
  });
});

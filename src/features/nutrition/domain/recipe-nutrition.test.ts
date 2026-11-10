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
  jasmin: food("jasminris", "raffinerad", per(354, 7.5, 0.7, 78.2, 0), { lmvNumber: 2477 }),
  chicken: food("kycklingfilé", "fagel", per(104, 23, 1.2, 0, 0), { gramsPerPiece: 150 }),
  oil: food("olja", "fett", per(900, 0, 100, 0, 0)),
  garlic: food("vitlök", "gronsak", per(130, 6, 0.1, 25, 2), { lmvNumber: 371 }),
  ginger: food("färsk ingefära", "gronsak", per(63, 2.2, 0.8, 9, 5.4)),
  milk: food("mjölk", "mejeri", per(60, 3.6, 3, 4.6, 0)),
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
    const result = recipeNutrition([line("pasta", 100, "g"), line(null, null, null, true), line("milk", null, null, true)], rows, 1);
    expect(result.coverage).toMatchObject({ counted: 1, total: 1 });
  });

  it("does not count lines it cannot weigh, but keeps them in the total", () => {
    const result = recipeNutrition(
      [
        line("pasta", 100, "g"),
        line(null, 2, "dl"), // no catalog ingredient
        line("beef", 1, "kvist"), // unit unknown
        line("unknown-id", null, null), // no amount, not vague, unknown food
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

describe("lines without an amount: a usual portion of a known food", () => {
  it("counts jasminris with no amount as 75 g dry per portion, 300 g for 4, and says it is estimated", () => {
    const withRice = recipeNutrition([{ ...line("jasmin", null, null, true), ingredientName: "Jasminris" }, line("chicken", 600, "g")], rows, 4);
    const without = recipeNutrition([line("chicken", 600, "g")], rows, 4);
    expect(withRice.gramsPerServing).toBeCloseTo(150 + 75);
    expect(withRice.perServing.kcal).toBeCloseTo(without.perServing.kcal + 3.54 * 75);
    expect(withRice.coverage).toMatchObject({ counted: 2, total: 2, estimated: 1, countedG: 900 });
    expect(withRice.groupGrams.raffinerad).toBeCloseTo(75);
    expect(withRice.portionEstimates).toEqual([{ name: "jasminris", gramsPerServing: 75 }]);
  });

  it("makes a recipe trustworthy that was held back only by the missing rice", () => {
    const lines = [line("chicken", 600, "g"), line("jasmin", null, null, true), line("tomato", 4, "dl"), line("pasta", 100, "g"), line("unknown-id", null, null)];
    const result = recipeNutrition(lines, rows, 4);
    expect(result.coverage).toMatchObject({ counted: 4, total: 5 });
    expect(isTrustworthy(result.coverage)).toBe(true);
    const old = recipeNutrition(lines.filter((l) => l.ingredientId !== "jasmin"), rows, 4);
    expect(old.coverage).toMatchObject({ counted: 3, total: 4 });
  });

  it("does not estimate dairy, not even without the vague flag", () => {
    const result = recipeNutrition([line("chicken", 400, "g"), line("milk", null, null)], rows, 4);
    expect(result.coverage).toMatchObject({ counted: 1, total: 2 });
    expect(result.uncounted).toHaveLength(1);
    expect(result.portionEstimates).toEqual([]);
  });

  it("still skips spices, garlic and vague dairy with no amount", () => {
    const result = recipeNutrition(
      [line("pasta", 100, "g"), line("salt", null, null, true), line("garlic", null, null, true), line("milk", null, null, true)],
      rows,
      1,
    );
    expect(result.coverage).toMatchObject({ counted: 1, total: 1 });
    expect(result.portionEstimates).toEqual([]);
  });

  it("leaves a not vague line without an ingredient row uncounted", () => {
    const result = recipeNutrition([line("pasta", 100, "g"), line("unknown-id", null, null)], rows, 1);
    expect(result.uncounted).toHaveLength(1);
    expect(result.uncounted[0].reason).toBe("unknown_ingredient");
  });

  it("still counts when most counted lines are estimated", () => {
    const result = recipeNutrition([line("jasmin", null, null, true), line("chicken", null, null, true)], rows, 2);
    expect(result.coverage).toMatchObject({ counted: 2, total: 2, estimated: 2 });
    expect(result.gramsPerServing).toBeCloseTo(75 + 140);
  });
});

describe("cooking fat, lengths and negligible ingredients", () => {
  it("estimates a vague cooking oil as 5 g per portion, with real kcal", () => {
    const result = recipeNutrition([line("pasta", 400, "g"), { ...line("oil", null, null, true), ingredientName: "Matolja" }], rows, 4);
    expect(result.coverage).toMatchObject({ counted: 2, total: 2, estimated: 1 });
    expect(result.portionEstimates).toEqual([{ name: "matolja", gramsPerServing: 5 }]);
    expect(result.perServing.kcal).toBeCloseTo((400 * 3.58 + 20 * 9) / 4);
  });

  it("does not change oil with an amount", () => {
    const result = recipeNutrition([line("pasta", 100, "g"), line("oil", 2, "msk")], { ...rows, oil: food("olja", "fett", per(900, 0, 100, 0, 0), { gramsPerDl: 90 }) }, 1);
    expect(result.coverage).toMatchObject({ counted: 2, total: 2 });
    expect(result.coverage.estimated).toBe(0);
    expect(result.portionEstimates).toEqual([]);
  });

  it("takes grams from '5 cm' in the text as written: ginger is 25 g", () => {
    const result = recipeNutrition([{ ...line("ginger", null, null, true), originalText: "5 cm färsk ingefära", ingredientName: "färsk ingefära" }], rows, 1);
    expect(result.coverage).toMatchObject({ counted: 1, total: 1, estimated: 1, countedG: 25 });
    expect(result.negligible).toEqual([]);
  });

  it("leaves negligible ingredients out of the coverage when they cannot be weighed", () => {
    const result = recipeNutrition(
      [
        line("pasta", 100, "g"),
        { ...line("ginger", null, null, true), originalText: "ingefära efter smak", ingredientName: "färsk ingefära" },
        { ...line("ginger", 1, "kvist"), ingredientName: "färsk ingefära" },
        { ...line(null, null, null, true), originalText: "vitlök", ingredientName: "vitlök" },
      ],
      rows,
      1,
    );
    expect(result.coverage).toMatchObject({ counted: 1, total: 1 });
    expect(result.negligible).toEqual(["färsk ingefära", "vitlök"]);
    expect(result.uncounted).toEqual([]);
  });

  it("still counts a negligible ingredient that has a weighable amount", () => {
    const result = recipeNutrition([line("pasta", 100, "g"), { ...line("ginger", 20, "g"), ingredientName: "färsk ingefära" }], rows, 1);
    expect(result.coverage).toMatchObject({ counted: 2, total: 2 });
    expect(result.negligible).toEqual([]);
  });

  it("does not guess cm for an unknown food", () => {
    const result = recipeNutrition([{ ...line("beef", null, null, true), originalText: "5 cm nötfärs", ingredientName: "nötfärs" }], rows, 1);
    expect(result.portionEstimates).toEqual([{ name: "nötfärs", gramsPerServing: 130 }]);
  });

  it("counts a whole recipe: rice and spaghetti with no amount, vague oil, 5 cm ginger", () => {
    const lines = [
      { ...line("jasmin", null, null, true), ingredientName: "jasminris" },
      { ...line("pasta", null, null, true), ingredientName: "spaghetti" },
      { ...line("oil", null, null, true), ingredientName: "matolja" },
      { ...line("ginger", null, null, true), originalText: "5 cm färsk ingefära", ingredientName: "färsk ingefära" },
      { ...line("garlic", null, null, true), ingredientName: "vitlök" },
      line("chicken", 600, "g"),
      line("tomato", 4, "dl"),
    ];
    const result = recipeNutrition(lines, rows, 4);
    expect(isTrustworthy(result.coverage)).toBe(true);
    expect(result.coverage).toMatchObject({ counted: 6, total: 6, estimated: 4 });
    expect(result.negligible).toEqual(["vitlök"]);
    expect(result.portionEstimates.map((e) => e.name)).toEqual(["jasminris", "spaghetti", "matolja", "färsk ingefära"]);
    // kcal per portion: rice 75 g, pasta 90 g, oil 5 g, ginger 6,25 g, chicken 150 g, tomatoes 100 g
    const kcal = 75 * 3.54 + 90 * 3.58 + 5 * 9 + 6.25 * 0.63 + 150 * 1.04 + 100 * 0.22;
    expect(result.perServing.kcal).toBeCloseTo(kcal);
    expect(roundedKcal(result.perServing.kcal)).toBeGreaterThan(600);
  });
});

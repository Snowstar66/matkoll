import { describe, expect, it } from "vitest";
import { assessKostrad, FOLLOWS_MIN_COVERAGE, GREEN_MIN_G, plateShares, RED_MEAT_MAX_G, summarizeWeek } from "./kostrad";
import { KOSTRAD_GROUPS, type KostradGroup } from "./groups";
import type { RecipeNutrition } from "./recipe-nutrition";

/** A RecipeNutrition with the given grams per portion by group, fully counted unless `coverage` says otherwise. */
function dish(groups: Partial<Record<KostradGroup, number>>, coverage: RecipeNutrition["coverage"] = { counted: 5, total: 5 }): RecipeNutrition {
  const g = Object.fromEntries(KOSTRAD_GROUPS.map((group) => [group, groups[group] ?? 0])) as Record<KostradGroup, number>;
  return {
    perServing: { kcal: 500, proteinG: 30, fatG: 20, carbsG: 50, fiberG: 6 },
    gramsPerServing: Object.values(g).reduce((a, b) => a + b, 0),
    groupGrams: g,
    plateGrams: {
      gronsaker: g.gronsak + g.baljvaxt,
      kolhydrater: g.fullkorn + g.raffinerad,
      protein: g.fisk + g.rott_kott + g.fagel + g.agg,
    },
    coverage,
    uncounted: [],
  };
}

describe("plateShares", () => {
  it("draws no plate when the counted lines are not a reliable basis", () => {
    expect(plateShares(dish({ raffinerad: 300 }, { counted: 3, total: 5 }))).toBeNull();
    expect(plateShares(dish({ raffinerad: 300 }, { counted: 7, total: 8, countedG: 400, uncountedG: 600 }))).toBeNull();
  });

  it("shares the plate by weight", () => {
    expect(plateShares(dish({ gronsak: 200, raffinerad: 100, fisk: 100 }))).toEqual({
      gronsaker: 0.5,
      kolhydrater: 0.25,
      protein: 0.25,
    });
  });

  it("adds up to one", () => {
    const shares = plateShares(dish({ gronsak: 130, fullkorn: 70, agg: 55, fagel: 31 }))!;
    expect(shares.gronsaker + shares.kolhydrater + shares.protein).toBeCloseTo(1);
  });

  it("is null when too little is on the plate", () => {
    expect(plateShares(dish({ gronsak: 50, fisk: 40 }))).toBeNull();
    expect(plateShares(dish({}))).toBeNull();
  });

  it("leaves dairy, fat and sugar off the plate", () => {
    expect(plateShares(dish({ gronsak: 100, mejeri: 500, fett: 50, socker: 50 }))).toEqual({
      gronsaker: 1,
      kolhydrater: 0,
      protein: 0,
    });
  });
});

describe("assessKostrad tags", () => {
  it("tags a green dish", () => {
    expect(assessKostrad(dish({ gronsak: GREEN_MIN_G })).tags).toEqual(["Mycket grönt"]);
    expect(assessKostrad(dish({ gronsak: GREEN_MIN_G - 1 })).tags).toEqual([]);
  });

  it("counts pulses as green on the plate", () => {
    expect(assessKostrad(dish({ baljvaxt: 160 })).tags).toContain("Mycket grönt");
  });

  it("tags fish, pulses and whole grain at their limits", () => {
    expect(assessKostrad(dish({ fisk: 50 })).tags).toEqual(["Fisk"]);
    expect(assessKostrad(dish({ fisk: 49 })).tags).toEqual([]);
    expect(assessKostrad(dish({ baljvaxt: 50 })).tags).toEqual(["Baljväxter"]);
    expect(assessKostrad(dish({ fullkorn: 40 })).tags).toEqual(["Fullkorn"]);
    expect(assessKostrad(dish({ fullkorn: 39 })).tags).toEqual([]);
  });

  it("does not tag whole grain when refined carbohydrates outweigh it", () => {
    expect(assessKostrad(dish({ fullkorn: 60, raffinerad: 100 })).tags).toEqual([]);
    expect(assessKostrad(dish({ fullkorn: 60, raffinerad: 60 })).tags).toEqual(["Fullkorn"]);
  });

  it("shows at most two tags, the most outstanding first", () => {
    expect(assessKostrad(dish({ gronsak: 100, fisk: 200, baljvaxt: 60, fullkorn: 45 })).tags).toEqual(["Fisk", "Baljväxter"]);
  });

  it("breaks ties in the fixed order", () => {
    expect(assessKostrad(dish({ gronsak: GREEN_MIN_G, fisk: 50, fullkorn: 40 })).tags).toEqual(["Mycket grönt", "Fisk"]);
  });

  it("gives no tags for an empty dish", () => {
    expect(assessKostrad(dish({})).tags).toEqual([]);
  });
});

describe("assessKostrad follows", () => {
  it("follows when green, fish or pulses and little red meat", () => {
    expect(assessKostrad(dish({ gronsak: 200 })).follows).toBe(true);
    expect(assessKostrad(dish({ fisk: 120 })).follows).toBe(true);
    expect(assessKostrad(dish({ baljvaxt: 80 })).follows).toBe(true);
  });

  it("does not follow with whole grain alone, or with nothing", () => {
    expect(assessKostrad(dish({ fullkorn: 100 })).follows).toBe(false);
    expect(assessKostrad(dish({})).follows).toBe(false);
  });

  it("does not follow with too much red meat, even when green", () => {
    expect(assessKostrad(dish({ gronsak: 300, rott_kott: RED_MEAT_MAX_G })).follows).toBe(true);
    expect(assessKostrad(dish({ gronsak: 300, rott_kott: RED_MEAT_MAX_G + 1 })).follows).toBe(false);
  });

  it("needs enough of the lines counted", () => {
    const enough = { counted: 6, total: 10 };
    expect(enough.counted / enough.total).toBeGreaterThanOrEqual(FOLLOWS_MIN_COVERAGE);
    expect(assessKostrad(dish({ gronsak: 200 }, enough)).follows).toBe(true);
    expect(assessKostrad(dish({ gronsak: 200 }, { counted: 5, total: 10 })).follows).toBe(false);
    expect(assessKostrad(dish({ gronsak: 200 }, { counted: 0, total: 0 })).follows).toBe(false);
  });

  it("reports the red meat per portion", () => {
    expect(assessKostrad(dish({ rott_kott: 120 })).redMeatG).toBe(120);
  });
});

describe("summarizeWeek", () => {
  it("counts fish dishes, green dishes and red meat per person", () => {
    const summary = summarizeWeek([
      dish({ fisk: 120, gronsak: 160 }),
      dish({ fisk: 100 }),
      dish({ gronsak: 200, rott_kott: 30 }),
      dish({ rott_kott: 110, raffinerad: 100 }),
      dish({ fagel: 130 }),
    ]);
    expect(summary).toEqual({ dinners: 5, assessed: 5, fishDishes: 2, greenDishes: 2, redMeatGramsPerPerson: 140 });
  });

  it("skips recipes without nutrition but still counts the dinners", () => {
    const summary = summarizeWeek([null, dish({ fisk: 100 }), dish({}, { counted: 0, total: 3 })]);
    expect(summary).toEqual({ dinners: 3, assessed: 1, fishDishes: 1, greenDishes: 0, redMeatGramsPerPerson: 0 });
  });

  it("counts a recipe planned twice twice", () => {
    const fish = dish({ fisk: 100 });
    expect(summarizeWeek([fish, fish]).fishDishes).toBe(2);
  });

  it("handles an empty week", () => {
    expect(summarizeWeek([])).toEqual({ dinners: 0, assessed: 0, fishDishes: 0, greenDishes: 0, redMeatGramsPerPerson: 0 });
  });
});

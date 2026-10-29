import { describe, expect, it } from "vitest";
import { toSnapshot } from "@/features/pantry";
import {
  addedOnDayText,
  defaultWeekday,
  groupByWeekday,
  movedText,
  todayWeekday,
  weekdayDateText,
  addToPlanSchema,
  clampServings,
  comparePlanRecipes,
  deletePlanQuestion,
  dishCountText,
  leftOutText,
  dishMetaText,
  dishProgress,
  dishStatus,
  isoWeek,
  isoWeekName,
  planDateText,
  planRecipeRowSchema,
  planSummaryText,
  removedDishesText,
  servingsChangeSchema,
  toPlanDishes,
  type DishRecipe,
  type PlanRecipe,
} from "./meal-plan";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe("isoWeek and isoWeekName", () => {
  it.each([
    ["2026-10-26T10:00:00Z", 44],
    // Sunday 1 November 2026 is still week 44; Monday the 2nd starts week 45.
    ["2026-11-01T12:00:00Z", 44],
    ["2026-11-02T08:00:00Z", 45],
    // 1 January 2027 is a Friday: it belongs to week 53 of 2026.
    ["2027-01-01T12:00:00Z", 53],
    ["2027-01-04T12:00:00Z", 1],
    // 29 December 2025 is a Monday in week 1 of 2026.
    ["2025-12-29T12:00:00Z", 1],
  ])("%s is week %i", (date, week) => {
    expect(isoWeek(new Date(date))).toBe(week);
  });

  it("counts the day in Stockholm, not in UTC", () => {
    // Sunday 23:30 UTC is already Monday 00:30 in Stockholm (winter time).
    expect(isoWeek(new Date("2026-11-01T23:30:00Z"))).toBe(45);
    expect(isoWeek(new Date("2026-11-01T23:30:00Z"), "UTC")).toBe(44);
  });

  it("names a new plan after the week", () => {
    expect(isoWeekName(new Date("2026-10-26T10:00:00Z"))).toBe("Vecka 44");
  });
});

describe("schemas", () => {
  it("takes a recipe id, with optional servings and id", () => {
    expect(addToPlanSchema.safeParse({ recipeId: id(1) }).success).toBe(true);
    expect(addToPlanSchema.safeParse({ recipeId: id(1), servings: 6, id: id(2) }).success).toBe(true);
    expect(addToPlanSchema.safeParse({ recipeId: "inte-ett-id" }).success).toBe(false);
    expect(addToPlanSchema.safeParse({ recipeId: id(1), servings: 0 }).success).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN, 1001])("refuses %s servings", (servings) => {
    expect(servingsChangeSchema.safeParse({ id: id(1), servings }).success).toBe(false);
  });

  it("takes a removed row back, with or without its recipe", () => {
    const row = { id: id(1), mealPlanId: id(2), recipeId: id(3), recipeTitle: "Pasta", servings: 4, position: 0 };
    expect(planRecipeRowSchema.safeParse(row).success).toBe(true);
    expect(planRecipeRowSchema.safeParse({ ...row, recipeId: null }).success).toBe(true);
    expect(planRecipeRowSchema.safeParse({ ...row, recipeTitle: " " }).success).toBe(false);
  });
});

describe("toPlanDishes", () => {
  const dish = (n: number, position: number, recipeId: string | null): PlanRecipe => ({
    id: id(n),
    recipeId,
    recipeTitle: `Rätt ${n}`,
    servings: 4,
    position,
  });
  const recipe: DishRecipe = { imageUrl: null, totalMinutes: 30, originalServings: 4, lines: [] };

  it("orders by position, then id, and joins each dish with its recipe", () => {
    const dishes = toPlanDishes([dish(3, 1, id(9)), dish(2, 0, null), dish(1, 1, id(8))], new Map([[id(9), recipe]]));
    expect(dishes.map((d) => d.id)).toEqual([id(2), id(1), id(3)]);
    expect(dishes.map((d) => d.recipe)).toEqual([null, null, recipe]);
  });

  it("compares dishes like the list orders them", () => {
    expect(comparePlanRecipes(dish(1, 0, null), dish(2, 1, null))).toBeLessThan(0);
    expect(comparePlanRecipes(dish(2, 1, null), dish(1, 1, null))).toBeGreaterThan(0);
  });
});

describe("dishStatus", () => {
  const milk = id(7);
  const recipe: DishRecipe = {
    imageUrl: null,
    totalMinutes: null,
    originalServings: 4,
    lines: [{ id: id(1), ingredientId: milk, amount: 4, unit: "dl", isVague: false }],
  };
  const snapshot = toSnapshot([{ ingredientId: milk, amount: 4, unit: "dl" }]);

  it("counts the status for the dish's servings", () => {
    expect(dishStatus(recipe, 4, snapshot)?.missingCount).toBe(0);
    expect(dishStatus(recipe, 6, snapshot)?.missingCount).toBe(1);
  });

  it("has no status without a pantry or a recipe", () => {
    expect(dishStatus(recipe, 4, null)).toBeNull();
    expect(dishStatus(null, 4, snapshot)).toBeNull();
  });
});

describe("dishProgress", () => {
  it.each([
    [2, 6, 8, "6 av 8 hemma", 0.75],
    [3, 0, 3, "0 av 3 hemma", 0],
    [2, 3, 5, "3 av 5 hemma", 0.6],
    [0, 8, 8, "Allt finns hemma", 1],
    [0, 1, 1, "Allt finns hemma", 1],
    // Nothing missing, though a vague line's ingredient is not at home: as "Kan lagas nu".
    [0, 1, 2, "Allt finns hemma", 1],
    // Something missing never reads as everything at home.
    [1, 8, 8, "7 av 8 hemma", 0.875],
  ])("%i missing, %i of %i at home: %s, meter %d", (missingCount, atHomeCount, ingredientCount, text, value) => {
    expect(dishProgress({ missingCount, atHomeCount, ingredientCount })).toEqual({ text, value });
  });

  it("has nothing to say without a catalog ingredient to count, or with counts that are not numbers", () => {
    expect(dishProgress({ missingCount: 0, atHomeCount: 0, ingredientCount: 0 })).toBeNull();
    expect(dishProgress({ missingCount: 0, atHomeCount: 0, ingredientCount: Number.NaN })).toBeNull();
    expect(dishProgress({ missingCount: 0, atHomeCount: 0, ingredientCount: Infinity })).toBeNull();
    expect(dishProgress({ missingCount: 1, atHomeCount: Number.NaN, ingredientCount: 4 })).toEqual({
      text: "0 av 4 hemma",
      value: 0,
    });
    expect(dishProgress({ missingCount: 2, atHomeCount: -3, ingredientCount: 4 })?.value).toBe(0);
  });

  it("agrees with the library's status when a vague line's ingredient is not at home", () => {
    const cream = id(7);
    const salt = id(8);
    const recipe: DishRecipe = {
      imageUrl: null,
      totalMinutes: 20,
      originalServings: 4,
      lines: [
        { id: id(1), ingredientId: cream, amount: 2, unit: "dl", isVague: false },
        { id: id(2), ingredientId: salt, amount: null, unit: null, isVague: true },
      ],
    };
    const status = dishStatus(recipe, 4, toSnapshot([{ ingredientId: cream, amount: 2, unit: "dl" }]))!;
    expect(status).toMatchObject({ missingCount: 0, atHomeCount: 1, ingredientCount: 2 });
    expect(dishProgress(status)).toEqual({ text: "Allt finns hemma", value: 1 });
  });

  it("follows the dish's servings through dishStatus", () => {
    const milk = id(7);
    const egg = id(8);
    const recipe: DishRecipe = {
      imageUrl: null,
      totalMinutes: null,
      originalServings: 4,
      lines: [
        { id: id(1), ingredientId: milk, amount: 4, unit: "dl", isVague: false },
        { id: id(2), ingredientId: egg, amount: 2, unit: "st", isVague: false },
      ],
    };
    const snapshot = toSnapshot([
      { ingredientId: milk, amount: 4, unit: "dl" },
      { ingredientId: egg, amount: 6, unit: "st" },
    ]);
    expect(dishProgress(dishStatus(recipe, 4, snapshot)!)).toEqual({ text: "Allt finns hemma", value: 1 });
    expect(dishProgress(dishStatus(recipe, 5, snapshot)!)).toEqual({ text: "1 av 2 hemma", value: 0.5 });
  });
});

describe("dishMetaText", () => {
  const recipeId = id(1);
  it.each([
    [recipeId, 35, { text: "6 av 8 hemma", value: 0.75 }, "35 min · 6 av 8 hemma"],
    [recipeId, null, { text: "Allt finns hemma", value: 1 }, "Allt finns hemma"],
    [recipeId, 35, null, "35 min"],
    [recipeId, Number.NaN, null, null],
    [recipeId, 0, null, null],
    [null, 35, null, "Borttaget recept"],
  ] as const)("%s, %s min, %o: %s", (id, minutes, progress, text) => {
    expect(dishMetaText(id, minutes, progress)).toBe(text);
  });
});

describe("removedDishesText", () => {
  it("names one or two dishes, and counts more", () => {
    expect(removedDishesText(["Pasta"])).toBe("Pasta är borttagen från matsedeln.");
    expect(removedDishesText(["Pasta", "Soppa"])).toBe("Pasta och Soppa är borttagna från matsedeln.");
    expect(removedDishesText(["Pasta", "Soppa", "Gryta"])).toBe("3 rätter är borttagna från matsedeln.");
  });
});

describe("clampServings", () => {
  it.each([
    [4, 4],
    [0, 1],
    [-2, 1],
    [2.6, 3],
    [5000, 1000],
    [Number.NaN, 1],
  ])("makes %s servings %s", (servings, clamped) => {
    expect(clampServings(servings)).toBe(clamped);
  });
});

describe("Tidigare", () => {
  it("writes the creation date in Stockholm with a fixed month abbreviation", () => {
    expect(planDateText("2026-10-26T10:00:00Z")).toBe("26 okt 2026");
    expect(planDateText("2027-03-05T10:00:00Z")).toBe("5 mars 2027");
    // 23:30 UTC on New Year's Eve is already 1 January in Stockholm.
    expect(planDateText("2026-12-31T23:30:00Z")).toBe("1 jan 2027");
    expect(planDateText("2026-12-31T23:30:00Z", "UTC")).toBe("31 dec 2026");
  });

  it("says how many dishes and when the plan was made", () => {
    expect(dishCountText(1)).toBe("1 rätt");
    expect(dishCountText(0)).toBe("0 rätter");
    expect(planSummaryText({ dishCount: 3, createdAt: "2026-10-26T10:00:00Z" })).toBe("3 rätter · skapad 26 okt 2026");
  });

  it("says how many dishes with deleted recipes do not come along", () => {
    expect(leftOutText(0)).toBeNull();
    expect(leftOutText(1)).toBe("1 rätt med borttaget recept följer inte med.");
    expect(leftOutText(3)).toBe("3 rätter med borttagna recept följer inte med.");
  });

  it("asks before a plan is deleted", () => {
    expect(deletePlanQuestion("Vecka 42")).toBe("Ta bort Vecka 42? Det går inte att ångra.");
  });
});

describe("days on the menu (Story 13.5)", () => {
  it("finds today's weekday in Stockholm", () => {
    expect(todayWeekday(new Date("2026-10-26T10:00:00Z"))).toBe(1);
    expect(todayWeekday(new Date("2026-11-01T10:00:00Z"))).toBe(7);
    // 23:30 UTC on a Sunday is already Monday in Stockholm.
    expect(todayWeekday(new Date("2026-11-01T23:30:00Z"))).toBe(1);
  });

  it("dates the days of a week, Monday to Sunday, in Stockholm (Story 13.6)", () => {
    const thursday = new Date("2026-10-29T10:00:00Z");
    expect([1, 4, 7].map((day) => weekdayDateText(thursday, day))).toEqual(["26 okt", "29 okt", "1 nov"]);
    // Monday and Sunday give the same week; 23:30 UTC on Sunday is already Monday in Stockholm.
    expect(weekdayDateText(new Date("2026-10-26T05:00:00Z"), 7)).toBe("1 nov");
    expect(weekdayDateText(new Date("2026-11-01T10:00:00Z"), 1)).toBe("26 okt");
    expect(weekdayDateText(new Date("2026-11-01T23:30:00Z"), 1)).toBe("2 nov");
    // Month and year boundaries.
    expect(weekdayDateText(new Date("2026-12-31T10:00:00Z"), 7)).toBe("3 jan");
    expect(weekdayDateText(new Date("2026-03-05T10:00:00Z"), 1)).toBe("2 mars");
  });

  it("keeps seven consecutive dates in a week with a clock change", () => {
    // Summer time ended on Sunday 25 October 2026.
    const dates = [1, 2, 3, 4, 5, 6, 7].map((day) => weekdayDateText(new Date("2026-10-25T10:00:00Z"), day));
    expect(dates).toEqual(["19 okt", "20 okt", "21 okt", "22 okt", "23 okt", "24 okt", "25 okt"]);
    // And the one that began on 29 March 2026.
    const spring = [1, 7].map((day) => weekdayDateText(new Date("2026-03-25T10:00:00Z"), day));
    expect(spring).toEqual(["23 mars", "29 mars"]);
  });

  it("defaults to the first day from today without a dish, else none", () => {
    expect(defaultWeekday([], 3)).toBe(3);
    expect(defaultWeekday([{ weekday: 3 }, { weekday: 4 }, { weekday: null }], 3)).toBe(5);
    expect(defaultWeekday([{ weekday: 6 }], 6)).toBe(7);
    expect(defaultWeekday([{ weekday: 6 }, { weekday: 7 }], 6)).toBeNull();
  });

  it("groups måndag to söndag, then Ingen dag än only when needed, keeping the order within a day", () => {
    const dishes = [
      { id: "a", position: 3, weekday: 2 },
      { id: "b", position: 1, weekday: 2 },
      { id: "c", position: 2, weekday: null },
      { id: "d", position: 0 },
    ];
    const sections = groupByWeekday(dishes);
    expect(sections.map((section) => section.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7, null]);
    expect(sections[1]?.dishes.map((dish) => dish.id)).toEqual(["b", "a"]);
    expect(sections[7]?.dishes.map((dish) => dish.id)).toEqual(["d", "c"]);
    expect(groupByWeekday([{ id: "a", position: 0, weekday: 7 }]).at(-1)?.weekday).toBe(7);
  });

  it("words the confirmations", () => {
    expect(addedOnDayText(4)).toBe("Lagt på matsedeln, torsdag.");
    expect(addedOnDayText(null)).toBe("Lagt på matsedeln.");
    expect(movedText("Pasta", 5)).toBe("Pasta ligger på fredag.");
    expect(movedText("Pasta", null)).toBe("Pasta har ingen dag.");
  });
});

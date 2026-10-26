import { describe, expect, it } from "vitest";
import { toSnapshot } from "@/features/pantry";
import {
  addToPlanSchema,
  clampServings,
  comparePlanRecipes,
  dishStatus,
  isoWeek,
  isoWeekName,
  planRecipeRowSchema,
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

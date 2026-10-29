import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { MealPlanDataError } from "../data/client";
import type { PlanRecipeRow } from "../domain/meal-plan";

// The meal plan's Server Actions with the user check, the session client, the
// recipes module, the data functions and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const getRecipesByIds = vi.fn();
const { RecipeDataError } = vi.hoisted(() => ({
  RecipeDataError: class RecipeDataError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
}));
vi.mock("@/features/recipes/server", () => ({
  RecipeDataError,
  getRecipesByIds: (ids: string[]) => getRecipesByIds(ids),
}));
const getCurrentPlanIn = vi.fn();
vi.mock("../data/queries", () => ({ getCurrentPlanIn: (...args: unknown[]) => getCurrentPlanIn(...args) }));
const data = {
  addToCurrentPlanIn: vi.fn(),
  setWeekdayIn: vi.fn(),
  setServingsIn: vi.fn(),
  removePlanRecipeIn: vi.fn(),
  restorePlanRecipeIn: vi.fn(),
  setCurrentPlanIn: vi.fn(),
  deletePlanIn: vi.fn(),
};
vi.mock("../data/write", () => ({
  addToCurrentPlanIn: (...args: unknown[]) => data.addToCurrentPlanIn(...args),
  setServingsIn: (...args: unknown[]) => data.setServingsIn(...args),
  setWeekdayIn: (...args: unknown[]) => data.setWeekdayIn(...args),
  removePlanRecipeIn: (...args: unknown[]) => data.removePlanRecipeIn(...args),
  restorePlanRecipeIn: (...args: unknown[]) => data.restorePlanRecipeIn(...args),
  setCurrentPlanIn: (...args: unknown[]) => data.setCurrentPlanIn(...args),
  deletePlanIn: (...args: unknown[]) => data.deletePlanIn(...args),
}));

const { addToCurrentPlan } = await import("./add-to-current-plan");
const { setServings } = await import("./set-servings");
const { setWeekday } = await import("./set-weekday");
const { removePlanRecipe } = await import("./remove-plan-recipe");
const { restorePlanRecipe } = await import("./restore-plan-recipe");
const { reusePlan } = await import("./reuse-plan");
const { newPlan } = await import("./new-plan");
const { deletePlan } = await import("./delete-plan");

const recipeId = "11111111-1111-4111-8111-111111111111";
const dishId = "22222222-2222-4222-8222-222222222222";
const planId = "33333333-3333-4333-8333-333333333333";
const row: PlanRecipeRow = { id: dishId, mealPlanId: planId, recipeId, recipeTitle: "Pasta", servings: 4, position: 0 };
const recipe = { id: recipeId, title: "Pasta", originalServings: 4, lines: [] };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  getRecipesByIds.mockReset().mockResolvedValue([recipe]);
  data.addToCurrentPlanIn.mockReset().mockResolvedValue(row);
  data.setServingsIn.mockReset().mockResolvedValue(true);
  data.setWeekdayIn.mockReset().mockResolvedValue(true);
  getCurrentPlanIn.mockReset().mockResolvedValue(null);
  data.removePlanRecipeIn.mockReset().mockResolvedValue(row);
  data.restorePlanRecipeIn.mockReset().mockImplementation(async (_db, restored: PlanRecipeRow) => restored);
  data.setCurrentPlanIn.mockReset().mockImplementation(async (_db, plan: { id: string; name: string }) => plan);
  data.deletePlanIn.mockReset().mockResolvedValue(true);
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("addToCurrentPlan", () => {
  it("adds the recipe with its own servings and title, in a plan named after the week", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T10:00:00Z"), toFake: ["Date"] });
    expect(await addToCurrentPlan({ recipeId })).toEqual(ok(row));
    vi.useRealTimers();
    expect(getRecipesByIds).toHaveBeenCalledWith([recipeId]);
    expect(data.addToCurrentPlanIn).toHaveBeenCalledWith(db, {
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      recipeId,
      recipeTitle: "Pasta",
      servings: 4,
      planName: "Vecka 44",
      // 26 Oct 2026 is a Monday, and the plan has no dish yet.
      weekday: 1,
      weekStart: "2026-10-26",
    });
    expect(revalidateFor).toHaveBeenCalledWith("meal_plan_recipe");
  });

  it("gives the first free day from today when no day is given, and none when the rest of the week is full", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T10:00:00Z"), toFake: ["Date"] });
    getCurrentPlanIn.mockResolvedValue({ id: planId, name: "Vecka 44", recipes: [{ weekday: 4 }, { weekday: 5 }, { weekday: 1 }] });
    await addToCurrentPlan({ recipeId });
    expect(data.addToCurrentPlanIn).toHaveBeenLastCalledWith(db, expect.objectContaining({ weekday: 6 }));
    getCurrentPlanIn.mockResolvedValue({ id: planId, name: "Vecka 44", recipes: [{ weekday: 4 }, { weekday: 5 }, { weekday: 6 }, { weekday: 7 }] });
    await addToCurrentPlan({ recipeId });
    expect(data.addToCurrentPlanIn).toHaveBeenLastCalledWith(db, expect.objectContaining({ weekday: null }));
    vi.useRealTimers();
  });

  it("takes a chosen day, or none, without reading the plan", async () => {
    await addToCurrentPlan({ recipeId, weekday: 3 });
    expect(data.addToCurrentPlanIn).toHaveBeenLastCalledWith(db, expect.objectContaining({ weekday: 3 }));
    await addToCurrentPlan({ recipeId, weekday: null });
    expect(data.addToCurrentPlanIn).toHaveBeenLastCalledWith(db, expect.objectContaining({ weekday: null }));
    expect(getCurrentPlanIn).not.toHaveBeenCalled();
    expect(await addToCurrentPlan({ recipeId, weekday: 8 })).toEqual(fail("validation"));
  });

  it("keeps a recipe's own servings within 1 to 1000", async () => {
    getRecipesByIds.mockResolvedValue([{ ...recipe, originalServings: 5000 }]);
    await addToCurrentPlan({ recipeId });
    expect(data.addToCurrentPlanIn).toHaveBeenCalledWith(db, expect.objectContaining({ servings: 1000 }));
  });

  it("takes given servings and id", async () => {
    await addToCurrentPlan({ recipeId, servings: 6, id: dishId });
    expect(data.addToCurrentPlanIn).toHaveBeenCalledWith(db, expect.objectContaining({ id: dishId, servings: 6 }));
  });

  it("refuses a recipe the user does not have, and adds nothing", async () => {
    getRecipesByIds.mockResolvedValue([]);
    expect(await addToCurrentPlan({ recipeId })).toEqual(fail("mealplan_add_failed"));
    expect(data.addToCurrentPlanIn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("mealplan_add_failed", { reason: "recipe_not_found" });
  });

  it.each([[{ recipeId: "inte-ett-id" }], [{ recipeId, servings: 0 }], [undefined]])("rejects %j", async (input) => {
    expect(await addToCurrentPlan(input as never)).toEqual(fail("validation"));
    expect(getRecipesByIds).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await addToCurrentPlan({ recipeId })).toEqual(fail("unauthorized"));
    expect(getRecipesByIds).not.toHaveBeenCalled();
  });

  it("gives mealplan_add_failed when the recipe or the plan cannot be read or written", async () => {
    getRecipesByIds.mockRejectedValueOnce(new RecipeDataError("query_failed 08006"));
    expect(await addToCurrentPlan({ recipeId })).toEqual(fail("mealplan_add_failed"));
    data.addToCurrentPlanIn.mockRejectedValueOnce(new MealPlanDataError("add_failed 23503"));
    expect(await addToCurrentPlan({ recipeId })).toEqual(fail("mealplan_add_failed"));
    expect(log).toHaveBeenCalledWith("mealplan_add_failed", { reason: "add_failed 23503" });
  });

  it("throws other errors, which are bugs", async () => {
    data.addToCurrentPlanIn.mockRejectedValue(new TypeError("boom"));
    await expect(addToCurrentPlan({ recipeId })).rejects.toThrow("boom");
  });
});

describe("setServings", () => {
  it("saves the servings and revalidates", async () => {
    expect(await setServings({ id: dishId, servings: 6 })).toEqual(ok({ id: dishId, servings: 6 }));
    expect(data.setServingsIn).toHaveBeenCalledWith(db, "user", dishId, 6);
    expect(revalidateFor).toHaveBeenCalledWith("meal_plan_recipe");
  });

  it.each([0, 1.5, -2])("refuses %s servings", async (servings) => {
    expect(await setServings({ id: dishId, servings })).toEqual(fail("validation"));
    expect(data.setServingsIn).not.toHaveBeenCalled();
  });

  it("fails for a dish the user no longer has, or when the update fails", async () => {
    data.setServingsIn.mockResolvedValueOnce(false);
    expect(await setServings({ id: dishId, servings: 2 })).toEqual(fail("mealplan_servings_failed"));
    data.setServingsIn.mockRejectedValueOnce(new MealPlanDataError("update_failed 08006"));
    expect(await setServings({ id: dishId, servings: 2 })).toEqual(fail("mealplan_servings_failed"));
  });
});

describe("removePlanRecipe and restorePlanRecipe", () => {
  it("removes the dish and returns it, then puts it back with the same id", async () => {
    const removed = await removePlanRecipe(dishId);
    expect(removed).toEqual(ok(row));
    expect(data.removePlanRecipeIn).toHaveBeenCalledWith(db, "user", dishId);
    expect(await restorePlanRecipe(row)).toEqual(ok(row));
    expect(data.restorePlanRecipeIn).toHaveBeenCalledWith(db, row);
    expect(revalidateFor).toHaveBeenCalledTimes(2);
  });

  it("fails to remove a dish the user does not have, and revalidates all the same", async () => {
    data.removePlanRecipeIn.mockResolvedValue(null);
    expect(await removePlanRecipe(dishId)).toEqual(fail("mealplan_remove_failed"));
    expect(revalidateFor).toHaveBeenCalledWith("meal_plan_recipe");
  });

  it("rejects an id or a row that does not parse", async () => {
    expect(await removePlanRecipe("inte-ett-id")).toEqual(fail("validation"));
    expect(await restorePlanRecipe({ ...row, servings: 0 })).toEqual(fail("validation"));
  });

  it("gives mealplan_restore_failed when the row cannot be put back", async () => {
    data.restorePlanRecipeIn.mockRejectedValue(new MealPlanDataError("restore_failed 23503"));
    expect(await restorePlanRecipe(row)).toEqual(fail("mealplan_restore_failed"));
    expect(log).toHaveBeenCalledWith("mealplan_restore_failed", { reason: "restore_failed 23503" });
  });
});

const newPlanId = "44444444-4444-4444-8444-444444444444";

describe("reusePlan and newPlan", () => {
  it("makes a new current plan of the earlier one, named after this week, and revalidates", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T10:00:00Z"), toFake: ["Date"] });
    expect(await reusePlan(planId, newPlanId)).toEqual(ok({ id: newPlanId }));
    vi.useRealTimers();
    expect(data.setCurrentPlanIn).toHaveBeenCalledWith(db, { id: newPlanId, name: "Vecka 44", sourceId: planId });
    expect(revalidateFor).toHaveBeenCalledWith("meal_plan");
  });

  it("makes a new empty current plan, with an id of its own when none is given", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-02T10:00:00Z"), toFake: ["Date"] });
    const result = await newPlan();
    vi.useRealTimers();
    expect(result.ok).toBe(true);
    expect(data.setCurrentPlanIn).toHaveBeenCalledWith(db, {
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "Vecka 45",
    });
    expect(await newPlan(newPlanId)).toEqual(ok({ id: newPlanId }));
  });

  it("rejects ids that do not parse, and writes nothing", async () => {
    expect(await reusePlan("inte-ett-id", newPlanId)).toEqual(fail("validation"));
    expect(await reusePlan(planId, "inte-ett-id")).toEqual(fail("validation"));
    expect(await newPlan("inte-ett-id")).toEqual(fail("validation"));
    expect(data.setCurrentPlanIn).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await reusePlan(planId)).toEqual(fail("unauthorized"));
    expect(await newPlan()).toEqual(fail("unauthorized"));
    expect(data.setCurrentPlanIn).not.toHaveBeenCalled();
  });

  it("gives mealplan_create_failed when the plan cannot be made now, and revalidates nothing", async () => {
    data.setCurrentPlanIn.mockRejectedValue(new MealPlanDataError("set_current_failed 08006", "08006"));
    expect(await reusePlan(planId, newPlanId)).toEqual(fail("mealplan_create_failed"));
    expect(await newPlan(newPlanId)).toEqual(fail("mealplan_create_failed"));
    data.setCurrentPlanIn.mockRejectedValue(new MealPlanDataError("invalid_id"));
    expect(await newPlan(newPlanId)).toEqual(fail("mealplan_create_failed"));
    expect(log).toHaveBeenCalledWith("mealplan_create_failed", { reason: "set_current_failed 08006" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("gives mealplan_plan_gone when the plan to use again is deleted", async () => {
    data.setCurrentPlanIn.mockRejectedValue(new MealPlanDataError("set_current_failed P0002", "P0002"));
    expect(await reusePlan(planId, newPlanId)).toEqual(fail("mealplan_plan_gone"));
    expect(log).toHaveBeenCalledWith("mealplan_create_failed", { reason: "set_current_failed P0002" });
  });

  it.each(["55000", "23505", "22023"])("gives mealplan_plans_changed for %s, which a retry cannot fix", async (code) => {
    data.setCurrentPlanIn.mockRejectedValue(new MealPlanDataError(`set_current_failed ${code}`, code));
    expect(await reusePlan(planId, newPlanId)).toEqual(fail("mealplan_plans_changed"));
    expect(await newPlan(newPlanId)).toEqual(fail("mealplan_plans_changed"));
  });

  it("throws other errors, which are bugs", async () => {
    data.setCurrentPlanIn.mockRejectedValue(new TypeError("boom"));
    await expect(reusePlan(planId)).rejects.toThrow("boom");
  });
});

describe("deletePlan", () => {
  it("deletes the user's earlier plan and revalidates", async () => {
    expect(await deletePlan(planId)).toEqual(ok({ id: planId }));
    expect(data.deletePlanIn).toHaveBeenCalledWith(db, planId);
    expect(revalidateFor).toHaveBeenCalledWith("meal_plan");
  });

  it("counts a plan that is gone already as deleted", async () => {
    data.deletePlanIn.mockResolvedValue(false);
    expect(await deletePlan(planId)).toEqual(ok({ id: planId }));
    expect(revalidateFor).toHaveBeenCalledWith("meal_plan");
  });

  it("rejects an id that does not parse, and unauthorized callers", async () => {
    expect(await deletePlan("inte-ett-id")).toEqual(fail("validation"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await deletePlan(planId)).toEqual(fail("unauthorized"));
    expect(data.deletePlanIn).not.toHaveBeenCalled();
  });

  it("gives mealplan_delete_failed when the delete fails", async () => {
    data.deletePlanIn.mockRejectedValue(new MealPlanDataError("delete_failed 08006"));
    expect(await deletePlan(planId)).toEqual(fail("mealplan_delete_failed"));
    expect(log).toHaveBeenCalledWith("mealplan_delete_failed", { reason: "delete_failed 08006" });
    // The current plan is never deleted.
    data.deletePlanIn.mockRejectedValue(new MealPlanDataError("delete_failed 55000", "55000"));
    expect(await deletePlan(planId)).toEqual(fail("mealplan_delete_failed"));
  });
});

describe("setWeekday", () => {
  it("saves the day for the user's dish and revalidates", async () => {
    expect(await setWeekday({ id: dishId, weekday: 3 })).toEqual(ok({ id: dishId, weekday: 3 }));
    expect(data.setWeekdayIn).toHaveBeenCalledWith(db, "user", dishId, 3);
    expect(revalidateFor).toHaveBeenCalledWith("meal_plan_recipe");
    expect(await setWeekday({ id: dishId, weekday: null })).toEqual(ok({ id: dishId, weekday: null }));
  });

  it.each([[{ id: dishId, weekday: 0 }], [{ id: dishId, weekday: 8 }], [{ id: "x", weekday: 2 }], [{ id: dishId }]])(
    "rejects %j",
    async (input) => {
      expect(await setWeekday(input as never)).toEqual(fail("validation"));
      expect(data.setWeekdayIn).not.toHaveBeenCalled();
    },
  );

  it("fails for a dish the user does not have, and when the data fails", async () => {
    data.setWeekdayIn.mockResolvedValue(false);
    expect(await setWeekday({ id: dishId, weekday: 2 })).toEqual(fail("mealplan_weekday_failed"));
    data.setWeekdayIn.mockRejectedValue(new MealPlanDataError("weekday_failed 23514"));
    expect(await setWeekday({ id: dishId, weekday: 2 })).toEqual(fail("mealplan_weekday_failed"));
  });

  it("returns unauthorized without an allowed user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await setWeekday({ id: dishId, weekday: 2 })).toEqual(fail("unauthorized"));
  });
});

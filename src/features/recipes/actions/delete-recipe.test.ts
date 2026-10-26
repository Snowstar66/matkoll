import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";

// deleteRecipe with the user check, the session client, the delete and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const detachRecipe = vi.fn();
const { MealPlanDataError } = vi.hoisted(() => ({
  MealPlanDataError: class MealPlanDataError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
}));
vi.mock("@/features/mealplan/server", () => ({
  MealPlanDataError,
  detachRecipe: (...args: unknown[]) => detachRecipe(...args),
}));
const deleteRecipeIn = vi.fn();
vi.mock("../data/update", () => ({ deleteRecipeIn: (...args: unknown[]) => deleteRecipeIn(...args) }));

const { deleteRecipe } = await import("./delete-recipe");

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  deleteRecipeIn.mockReset().mockResolvedValue(true);
  detachRecipe.mockReset().mockResolvedValue(undefined);
  revalidateFor.mockReset();
});

describe("deleteRecipe", () => {
  it("deletes the user's recipe and revalidates the recipe routes", async () => {
    expect(await deleteRecipe(id)).toEqual(ok({ id }));
    expect(deleteRecipeIn).toHaveBeenCalledWith(db, "user", id);
    expect(revalidateFor).toHaveBeenCalledWith("recipe");
  });

  it("takes the recipe off the current meal plan first", async () => {
    const order: string[] = [];
    detachRecipe.mockImplementation(async () => void order.push("detach"));
    deleteRecipeIn.mockImplementation(async () => {
      order.push("delete");
      return true;
    });
    expect(await deleteRecipe(id)).toEqual(ok({ id }));
    expect(detachRecipe).toHaveBeenCalledWith(id);
    expect(order).toEqual(["detach", "delete"]);
  });

  it("keeps the recipe when the meal plan cannot be changed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    detachRecipe.mockRejectedValue(new MealPlanDataError("detach_failed 08006"));
    expect(await deleteRecipe(id)).toEqual(fail("recipe_delete_failed"));
    expect(deleteRecipeIn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("recipe_delete_failed", { reason: "detach_failed 08006" });
    log.mockRestore();
  });

  it("returns unauthorized without an allowed user, and deletes nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await deleteRecipe(id)).toEqual(fail("unauthorized"));
    expect(deleteRecipeIn).not.toHaveBeenCalled();
  });

  it.each([["inte-ett-id"], [""], [undefined]])("rejects the id %s", async (input) => {
    expect(await deleteRecipe(input as never)).toEqual(fail("validation"));
    expect(deleteRecipeIn).not.toHaveBeenCalled();
  });

  it("counts a recipe that is already gone (or another user's) as deleted, so a retry succeeds", async () => {
    deleteRecipeIn.mockResolvedValue(false);
    expect(await deleteRecipe(id)).toEqual(ok({ id }));
    expect(deleteRecipeIn).toHaveBeenCalledWith(db, "user", id);
  });

  it("gives recipe_delete_failed when the delete fails, and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteRecipeIn.mockRejectedValue(new RecipeDataError("delete_failed 08006"));
    expect(await deleteRecipe(id)).toEqual(fail("recipe_delete_failed"));
    expect(log).toHaveBeenCalledWith("recipe_delete_failed", { reason: "delete_failed 08006" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    deleteRecipeIn.mockRejectedValue(new TypeError("boom"));
    await expect(deleteRecipe(id)).rejects.toThrow("boom");
  });
});

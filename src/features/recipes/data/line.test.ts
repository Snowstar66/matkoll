import { describe, expect, it, vi } from "vitest";
import { RecipeDataError, type RecipesDb } from "./client";
import { setRecipeLineIn } from "./line";

const dbWith = (answer: { data: unknown; error: { code: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(answer);
  return { db: { rpc } as unknown as RecipesDb, rpc };
};
const at = "2026-11-17T10:00:00+00:00";

describe("setRecipeLineIn", () => {
  it("calls set_recipe_line with null for what is not changed, and gives the new updated_at", async () => {
    const { db, rpc } = dbWith({ data: "2026-11-17T10:00:05+00:00", error: null });
    expect(await setRecipeLineIn(db, "r", "l", at, { isStruck: true })).toEqual({ updatedAt: "2026-11-17T10:00:05+00:00" });
    expect(rpc).toHaveBeenCalledWith("set_recipe_line", {
      target_recipe: "r",
      target_line: "l",
      expected_updated_at: at,
      new_is_struck: true,
      new_amount: null,
    });
    await setRecipeLineIn(db, "r", "l", at, { amount: 2 });
    expect(rpc).toHaveBeenLastCalledWith("set_recipe_line", expect.objectContaining({ new_is_struck: null, new_amount: 2 }));
  });

  it("says not_found for a null answer and conflict for MK409", async () => {
    expect(await setRecipeLineIn(dbWith({ data: null, error: null }).db, "r", "l", at, { isStruck: false })).toBe("not_found");
    expect(await setRecipeLineIn(dbWith({ data: null, error: { code: "MK409" } }).db, "r", "l", at, { isStruck: false })).toBe("conflict");
  });

  it("throws RecipeDataError with the code for any other error", async () => {
    await expect(setRecipeLineIn(dbWith({ data: null, error: { code: "42501" } }).db, "r", "l", at, { isStruck: true })).rejects.toThrow(
      new RecipeDataError("line_failed 42501"),
    );
  });
});

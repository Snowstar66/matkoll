import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";

// setLineStruck and setLineAmount with the user check, the session client, the data function and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const setRecipeLineIn = vi.fn();
vi.mock("../data/line", () => ({ setRecipeLineIn: (...args: unknown[]) => setRecipeLineIn(...args) }));

const { setLineStruck, setLineAmount } = await import("./set-recipe-line");

const recipeId = "11111111-1111-4111-8111-111111111111";
const lineId = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-11-17T10:00:00.123456+00:00";
const newer = "2026-11-17T10:00:05.000000+00:00";

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  setRecipeLineIn.mockReset().mockResolvedValue({ updatedAt: newer });
  revalidateFor.mockReset();
});

describe("setLineStruck", () => {
  it("sets the strike against the recipe's updatedAt, revalidates, and gives the new updatedAt", async () => {
    expect(await setLineStruck({ recipeId, lineId, isStruck: true, updatedAt })).toEqual(ok({ updatedAt: newer }));
    expect(setRecipeLineIn).toHaveBeenCalledWith(db, recipeId, lineId, updatedAt, { isStruck: true });
    expect(revalidateFor).toHaveBeenCalledWith("recipe");
    await setLineStruck({ recipeId, lineId, isStruck: false, updatedAt });
    expect(setRecipeLineIn).toHaveBeenLastCalledWith(db, recipeId, lineId, updatedAt, { isStruck: false });
  });

  it("returns unauthorized without an allowed user, and changes nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await setLineStruck({ recipeId, lineId, isStruck: true, updatedAt })).toEqual(fail("unauthorized"));
    expect(setRecipeLineIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it.each([
    ["a recipe id that is not a uuid", { recipeId: "x", lineId, isStruck: true, updatedAt }],
    ["a line id that is not a uuid", { recipeId, lineId: "x", isStruck: true, updatedAt }],
    ["a strike that is not a boolean", { recipeId, lineId, isStruck: "ja", updatedAt }],
    ["an updatedAt that is not a time", { recipeId, lineId, isStruck: true, updatedAt: "igår" }],
    ["no input", undefined],
  ])("rejects %s", async (_, input) => {
    expect(await setLineStruck(input as never)).toEqual(fail("validation"));
    expect(setRecipeLineIn).not.toHaveBeenCalled();
  });

  it("gives recipe_conflict, without revalidating, when the recipe changed since the page read it", async () => {
    setRecipeLineIn.mockResolvedValue("conflict");
    expect(await setLineStruck({ recipeId, lineId, isStruck: true, updatedAt })).toEqual(fail("recipe_conflict"));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("fails when the household has no such recipe or line", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setRecipeLineIn.mockResolvedValue("not_found");
    expect(await setLineStruck({ recipeId, lineId, isStruck: true, updatedAt })).toEqual(fail("recipe_line_failed"));
    expect(log).toHaveBeenCalledWith("recipe_line_failed", { reason: "not_found" });
    expect(revalidateFor).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("fails with recipe_line_failed when the database fails, logging only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setRecipeLineIn.mockRejectedValue(new RecipeDataError("line_failed 42501"));
    expect(await setLineStruck({ recipeId, lineId, isStruck: true, updatedAt })).toEqual(fail("recipe_line_failed"));
    expect(log).toHaveBeenCalledWith("recipe_line_failed", { reason: "line_failed 42501" });
    log.mockRestore();
  });
});

describe("setLineAmount", () => {
  it("sets the amount for the recipe's own servings and revalidates", async () => {
    expect(await setLineAmount({ recipeId, lineId, amount: 0.75, updatedAt })).toEqual(ok({ updatedAt: newer }));
    expect(setRecipeLineIn).toHaveBeenCalledWith(db, recipeId, lineId, updatedAt, { amount: 0.75 });
    expect(revalidateFor).toHaveBeenCalledWith("recipe");
  });

  it.each([0, -1, Number.NaN, 2_000_000])("rejects the amount %s", async (amount) => {
    expect(await setLineAmount({ recipeId, lineId, amount, updatedAt })).toEqual(fail("validation"));
    expect(setRecipeLineIn).not.toHaveBeenCalled();
  });

  it("gives recipe_conflict and unauthorized as the strike does", async () => {
    setRecipeLineIn.mockResolvedValue("conflict");
    expect(await setLineAmount({ recipeId, lineId, amount: 2, updatedAt })).toEqual(fail("recipe_conflict"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await setLineAmount({ recipeId, lineId, amount: 2, updatedAt })).toEqual(fail("unauthorized"));
  });
});

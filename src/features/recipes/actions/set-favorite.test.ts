import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";

// setFavorite with the user check, the session client, the update and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const setFavoriteIn = vi.fn();
vi.mock("../data/favorite", () => ({ setFavoriteIn: (...args: unknown[]) => setFavoriteIn(...args) }));

const { setFavorite } = await import("./set-favorite");

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  setFavoriteIn.mockReset().mockResolvedValue(true);
  revalidateFor.mockReset();
});

describe("setFavorite", () => {
  it("sets the favourite and revalidates the recipe routes", async () => {
    expect(await setFavorite({ id, isFavorite: true })).toEqual(ok({ id, isFavorite: true }));
    expect(setFavoriteIn).toHaveBeenCalledWith(db, "user", id, true);
    expect(revalidateFor).toHaveBeenCalledWith("recipe");

    expect(await setFavorite({ id, isFavorite: false })).toEqual(ok({ id, isFavorite: false }));
    expect(setFavoriteIn).toHaveBeenLastCalledWith(db, "user", id, false);
  });

  it("returns unauthorized without an allowed user, and changes nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await setFavorite({ id, isFavorite: true })).toEqual(fail("unauthorized"));
    expect(setFavoriteIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it.each([
    ["an id that is not a uuid", { id: "inte-ett-id", isFavorite: true }],
    ["a favourite that is not a boolean", { id, isFavorite: "ja" }],
    ["no input", undefined],
  ])("rejects %s", async (_, input) => {
    expect(await setFavorite(input as never)).toEqual(fail("validation"));
    expect(setFavoriteIn).not.toHaveBeenCalled();
  });

  it("fails without revalidating when the user has no such recipe (another user's id)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setFavoriteIn.mockResolvedValue(false);
    expect(await setFavorite({ id, isFavorite: true })).toEqual(fail("recipe_favorite_failed"));
    expect(revalidateFor).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("recipe_favorite_failed", { reason: "not_found" });
    log.mockRestore();
  });

  it("gives recipe_favorite_failed when the update fails, and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setFavoriteIn.mockRejectedValue(new RecipeDataError("update_failed 08006"));
    expect(await setFavorite({ id, isFavorite: true })).toEqual(fail("recipe_favorite_failed"));
    expect(log).toHaveBeenCalledWith("recipe_favorite_failed", { reason: "update_failed 08006" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    setFavoriteIn.mockRejectedValue(new TypeError("boom"));
    await expect(setFavorite({ id, isFavorite: true })).rejects.toThrow("boom");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";

// backfillRecipeImages with the user check, the session client, the data functions and
// the picture stubbed: a few recipes at a time, only the ones without a copy, never a
// recipe's text.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const recipesWithoutImageIn = vi.fn();
const countWithoutImageIn = vi.fn();
const countWithImageIn = vi.fn();
vi.mock("../data/image", () => ({
  recipesWithoutImageIn: (...args: unknown[]) => recipesWithoutImageIn(...args),
  countWithoutImageIn: (...args: unknown[]) => countWithoutImageIn(...args),
  countWithImageIn: (...args: unknown[]) => countWithImageIn(...args),
}));
const storeRecipeImage = vi.fn();
const sweepRecipeImages = vi.fn();
vi.mock("./store-recipe-image", () => ({
  storeRecipeImage: (...args: unknown[]) => storeRecipeImage(...args),
  sweepRecipeImages: (...args: unknown[]) => sweepRecipeImages(...args),
}));

const { backfillRecipeImages } = await import("./backfill-recipe-images");

const ids = ["a1111111-1111-4111-8111-111111111111", "b2222222-2222-4222-8222-222222222222", "c3333333-3333-4333-8333-333333333333"];

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  recipesWithoutImageIn.mockReset().mockResolvedValue(ids);
  countWithoutImageIn.mockReset().mockResolvedValue(7);
  countWithImageIn.mockReset().mockResolvedValue(3);
  storeRecipeImage.mockReset().mockResolvedValue("stored");
  sweepRecipeImages.mockReset().mockResolvedValue(undefined);
  revalidateFor.mockReset();
});

describe("backfillRecipeImages", () => {
  it("takes at most 3 recipes without a copy and keeps each one's picture, then reports where the household is", async () => {
    expect(await backfillRecipeImages([])).toEqual(
      ok({ attempted: 3, stored: 3, failedIds: [], capReached: false, missing: 7, withCopy: 3 }),
    );
    expect(recipesWithoutImageIn).toHaveBeenCalledWith(db, [], 3);
    expect(storeRecipeImage.mock.calls.map((call) => call[1])).toEqual(ids);
    expect(revalidateFor).toHaveBeenCalledWith("recipe");
  });

  it("passes on the recipes the page has seen fail, so a run never stops on one that cannot be fetched", async () => {
    await backfillRecipeImages([ids[0]!]);
    expect(recipesWithoutImageIn).toHaveBeenCalledWith(db, [ids[0]], 3);
  });

  it("lists the recipes whose picture could not be kept, and goes on with the rest", async () => {
    storeRecipeImage.mockResolvedValueOnce("failed").mockResolvedValue("stored");
    expect(await backfillRecipeImages([])).toEqual(ok(expect.objectContaining({ attempted: 3, stored: 2, failedIds: [ids[0]] })));
  });

  it("stops at the household's cap and says so", async () => {
    storeRecipeImage.mockResolvedValueOnce("stored").mockResolvedValueOnce("cap");
    const result = await backfillRecipeImages([]);
    expect(result).toEqual(ok(expect.objectContaining({ attempted: 2, stored: 1, capReached: true, failedIds: [ids[1]] })));
    expect(storeRecipeImage).toHaveBeenCalledTimes(2);
  });

  it("does nothing when every recipe has its copy, and revalidates nothing", async () => {
    recipesWithoutImageIn.mockResolvedValue([]);
    countWithoutImageIn.mockResolvedValue(0);
    expect(await backfillRecipeImages([])).toEqual(ok({ attempted: 0, stored: 0, failedIds: [], capReached: false, missing: 0, withCopy: 3 }));
    expect(storeRecipeImage).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("sweeps the files no recipe points at on the way", async () => {
    await backfillRecipeImages([]);
    expect(sweepRecipeImages).toHaveBeenCalledWith(db);
  });

  it("stops starting new recipes after 25 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      storeRecipeImage.mockImplementation(async () => {
        vi.advanceTimersByTime(30_000);
        return "stored";
      });
      expect(await backfillRecipeImages([])).toEqual(ok(expect.objectContaining({ attempted: 1 })));
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses an unauthorized user, and a skip list that is not ids, before reading anything", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await backfillRecipeImages([])).toEqual(fail("unauthorized"));
    requireUser.mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
    expect(await backfillRecipeImages(["nope"])).toEqual(fail("validation"));
    expect(await backfillRecipeImages(null as never)).toEqual(fail("validation"));
    expect(recipesWithoutImageIn).not.toHaveBeenCalled();
  });

  it("fails without data when the database fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    recipesWithoutImageIn.mockRejectedValue(new RecipeDataError("images_missing_failed 08006"));
    expect(await backfillRecipeImages([])).toEqual(fail("recipe_images_failed"));
    expect(log).toHaveBeenCalledWith("recipe_images_failed", { reason: "images_missing_failed 08006" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { RecipeDataError } from "../data/client";

// setRecipeShared, setShareAllRecipes and stopSharingAllRecipes with the user check, the session
// client, the data functions and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const renameHousehold = vi.fn();
vi.mock("@/features/household/server", () => ({ renameHousehold: (input: unknown) => renameHousehold(input) }));
const setSharedIn = vi.fn();
const setShareAllIn = vi.fn();
const stopSharingIn = vi.fn();
vi.mock("../data/shared", () => ({
  setSharedIn: (...args: unknown[]) => setSharedIn(...args),
  setShareAllIn: (...args: unknown[]) => setShareAllIn(...args),
  stopSharingIn: (...args: unknown[]) => stopSharingIn(...args),
}));

const { setRecipeShared, setShareAllRecipes, stopSharingAllRecipes } = await import("./share-recipe");

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  revalidateFor.mockReset();
  renameHousehold.mockReset().mockResolvedValue(ok({ name: "Hellgrens" }));
  setSharedIn.mockReset().mockResolvedValue(true);
  setShareAllIn.mockReset().mockResolvedValue(4);
  stopSharingIn.mockReset().mockResolvedValue(3);
});

describe("setRecipeShared", () => {
  it("shares and stops sharing the household's recipe, and revalidates", async () => {
    expect(await setRecipeShared({ id, shared: true })).toEqual(ok({ id, shared: true }));
    expect(setSharedIn).toHaveBeenCalledWith(db, id, true);
    expect(await setRecipeShared({ id, shared: false })).toEqual(ok({ id, shared: false }));
    expect(setSharedIn).toHaveBeenLastCalledWith(db, id, false);
    expect(revalidateFor).toHaveBeenCalledWith("recipe");
  });

  it("renames the household first when given a name, and shares nothing when the rename fails", async () => {
    expect(await setRecipeShared({ id, shared: true }, "Hellgrens")).toEqual(ok({ id, shared: true }));
    expect(renameHousehold).toHaveBeenCalledWith({ name: "Hellgrens" });
    expect(renameHousehold.mock.invocationCallOrder[0]).toBeLessThan(setSharedIn.mock.invocationCallOrder[0]);
    setSharedIn.mockClear();
    const refused = fail("validation", { name: "Högst 60 tecken." });
    renameHousehold.mockResolvedValue(refused);
    expect(await setRecipeShared({ id, shared: true }, "x".repeat(61))).toEqual(refused);
    expect(setSharedIn).not.toHaveBeenCalled();
    // Without a name the household is left as it is.
    renameHousehold.mockClear();
    await setRecipeShared({ id, shared: true });
    expect(renameHousehold).not.toHaveBeenCalled();
  });

  it("fails for a recipe that is not the household's, or a refused one (a copy), without revalidating", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setSharedIn.mockResolvedValue(false);
    expect(await setRecipeShared({ id, shared: true })).toEqual(fail("recipe_share_failed"));
    setSharedIn.mockRejectedValue(new RecipeDataError("update_failed 42501"));
    expect(await setRecipeShared({ id, shared: true })).toEqual(fail("recipe_share_failed"));
    expect(log).toHaveBeenCalledWith("recipe_share_failed", { reason: "update_failed 42501" });
    expect(revalidateFor).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("refuses bad input and an unauthorized user", async () => {
    expect(await setRecipeShared({ id: "x", shared: true })).toEqual(fail("validation"));
    expect(await setRecipeShared({ id, shared: "ja" } as never)).toEqual(fail("validation"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await setRecipeShared({ id, shared: true })).toEqual(fail("unauthorized"));
    expect(setSharedIn).not.toHaveBeenCalled();
  });
});

describe("the household's switches", () => {
  it("renames the household first when Dela alla goes on with a name, and turns nothing on when the rename fails", async () => {
    expect(await setShareAllRecipes(true, "Hellgrens")).toEqual(ok({ sharedCount: 4 }));
    expect(renameHousehold).toHaveBeenCalledWith({ name: "Hellgrens" });
    setShareAllIn.mockClear();
    const refused = fail("validation", { name: "Skriv ett namn." });
    renameHousehold.mockResolvedValue(refused);
    expect(await setShareAllRecipes(true, " ")).toEqual(refused);
    expect(setShareAllIn).not.toHaveBeenCalled();
  });

  it("turns Dela alla on and off and gives the count", async () => {
    expect(await setShareAllRecipes(true)).toEqual(ok({ sharedCount: 4 }));
    expect(setShareAllIn).toHaveBeenCalledWith(db, true);
    expect(revalidateFor).toHaveBeenCalledWith("household");
    expect(await setShareAllRecipes("ja" as never)).toEqual(fail("validation"));
  });

  it("stops sharing all and gives how many stopped", async () => {
    expect(await stopSharingAllRecipes()).toEqual(ok({ stopped: 3 }));
    expect(stopSharingIn).toHaveBeenCalledWith(db);
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await stopSharingAllRecipes()).toEqual(fail("unauthorized"));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { ShoppingDataError } from "../data/client";

// setChecked with the user check, the session client, the data function and
// revalidation stubbed. The database compares the plan with the current one
// (set_shopping_check); here setCheckIn says what it found.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const setCheckIn = vi.fn();
vi.mock("../data/checks", () => ({ setCheckIn: (...args: unknown[]) => setCheckIn(...args) }));

const { setChecked } = await import("./set-checked");

const planId = "33333333-3333-4333-8333-333333333333";
const key = "r:11111111-1111-4111-8111-111111111111:st";

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  setCheckIn.mockReset().mockResolvedValue("saved");
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setChecked", () => {
  it.each([true, false])("saves checked = %s on the plan and revalidates the list", async (checked) => {
    expect(await setChecked({ planId, key, checked })).toEqual(ok({ planId, key, checked }));
    expect(setCheckIn).toHaveBeenCalledWith(db, planId, key, checked);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_check");
  });

  it("takes a text line's key and a vague line's key", async () => {
    expect((await setChecked({ planId, key: "t:en näve persilja", checked: true })).ok).toBe(true);
    expect((await setChecked({ planId, key: "r:11111111-1111-4111-8111-111111111111:-", checked: true })).ok).toBe(true);
  });

  it.each([
    [{ planId: "inte-ett-id", key, checked: true }],
    [{ planId, key: "r:inte-ett-id:st", checked: true }],
    [{ planId, key: "r:11111111-1111-4111-8111-111111111111:liter", checked: true }],
    [{ planId, key: "t:  Två  ord", checked: true }],
    [{ planId, key: `t:${"a".repeat(301)}`, checked: true }],
    [{ planId, key, checked: "ja" }],
    [undefined],
  ])("rejects %j without writing", async (input) => {
    expect(await setChecked(input as never)).toEqual(fail("validation"));
    expect(setCheckIn).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await setChecked({ planId, key, checked: true })).toEqual(fail("unauthorized"));
    expect(setCheckIn).not.toHaveBeenCalled();
  });

  it("gives shopping_plan_changed, without revalidating, when the plan is no longer the current one", async () => {
    setCheckIn.mockResolvedValue("plan_changed");
    expect(await setChecked({ planId, key, checked: true })).toEqual(fail("shopping_plan_changed"));
    expect(revalidateFor).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("gives shopping_check_failed, logged, when the check cannot be written", async () => {
    setCheckIn.mockRejectedValue(new ShoppingDataError("check_failed 08006", "08006"));
    expect(await setChecked({ planId, key, checked: true })).toEqual(fail("shopping_check_failed"));
    expect(log).toHaveBeenCalledWith("shopping_check_failed", { reason: "check_failed 08006" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("throws other errors, which are bugs", async () => {
    setCheckIn.mockRejectedValue(new TypeError("bug"));
    await expect(setChecked({ planId, key, checked: false })).rejects.toThrow("bug");
  });
});

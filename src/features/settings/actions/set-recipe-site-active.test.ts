import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { SettingsDataError } from "../data/client";

// setRecipeSiteActive with the user check, the session client, the update and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const setRecipeSiteActiveIn = vi.fn();
vi.mock("../data/sites", () => ({ setRecipeSiteActiveIn: (...args: unknown[]) => setRecipeSiteActiveIn(...args) }));

const { setRecipeSiteActive } = await import("./set-recipe-site-active");

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  setRecipeSiteActiveIn.mockReset().mockResolvedValue("changed");
  revalidateFor.mockReset();
});

describe("setRecipeSiteActive", () => {
  it("turns a site off and on again, and revalidates Inställningar", async () => {
    expect(await setRecipeSiteActive({ domain: "koket.se", isActive: false })).toEqual(
      ok({ domain: "koket.se", isActive: false, changed: true }),
    );
    expect(setRecipeSiteActiveIn).toHaveBeenCalledWith(db, "koket.se", false);
    expect(revalidateFor).toHaveBeenCalledWith("recipe_site");

    expect(await setRecipeSiteActive({ domain: "koket.se", isActive: true })).toEqual(
      ok({ domain: "koket.se", isActive: true, changed: true }),
    );
    expect(setRecipeSiteActiveIn).toHaveBeenLastCalledWith(db, "koket.se", true);
  });

  it("normalises the domain", async () => {
    await setRecipeSiteActive({ domain: "www.Koket.se", isActive: false });
    expect(setRecipeSiteActiveIn).toHaveBeenCalledWith(db, "koket.se", false);
  });

  it("returns unauthorized without an allowed user, and changes nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await setRecipeSiteActive({ domain: "koket.se", isActive: false })).toEqual(fail("unauthorized"));
    expect(setRecipeSiteActiveIn).not.toHaveBeenCalled();
  });

  it.each([
    ["a domain that is not one", { domain: "localhost", isActive: false }],
    ["isActive that is not a boolean", { domain: "koket.se", isActive: "nej" }],
    ["no input", undefined],
  ])("rejects %s", async (_, input) => {
    expect(await setRecipeSiteActive(input as never)).toEqual(fail("validation"));
    expect(setRecipeSiteActiveIn).not.toHaveBeenCalled();
  });

  it.each(["unchanged", "missing"])("reports turning off a site that is %s as done but not changed", async (outcome) => {
    setRecipeSiteActiveIn.mockResolvedValue(outcome);
    expect(await setRecipeSiteActive({ domain: "koket.se", isActive: false })).toEqual(
      ok({ domain: "koket.se", isActive: false, changed: false }),
    );
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("reports turning on a site that is on already as not changed", async () => {
    setRecipeSiteActiveIn.mockResolvedValue("unchanged");
    expect(await setRecipeSiteActive({ domain: "koket.se", isActive: true })).toEqual(
      ok({ domain: "koket.se", isActive: true, changed: false }),
    );
  });

  it("fails to turn on a site the user does not have (another user's)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setRecipeSiteActiveIn.mockResolvedValue("missing");
    expect(await setRecipeSiteActive({ domain: "koket.se", isActive: true })).toEqual(fail("settings_save_failed"));
    expect(revalidateFor).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("settings_save_failed", { reason: "not_found" });
    log.mockRestore();
  });

  it("gives settings_save_failed when the update fails, and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setRecipeSiteActiveIn.mockRejectedValue(new SettingsDataError("update_failed 08006"));
    expect(await setRecipeSiteActive({ domain: "koket.se", isActive: false })).toEqual(fail("settings_save_failed"));
    expect(log).toHaveBeenCalledWith("settings_save_failed", { reason: "update_failed 08006" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    setRecipeSiteActiveIn.mockRejectedValue(new TypeError("boom"));
    await expect(setRecipeSiteActive({ domain: "koket.se", isActive: false })).rejects.toThrow("boom");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// confirmEmailLink with Supabase stubbed: the start data is ensured after a
// sign-in (AD-21), and a failure there never stops the sign-in.

const verifyEmailLink = vi.fn();
vi.mock("../data/auth", () => ({ verifyEmailLink: (...args: unknown[]) => verifyEmailLink(...args) }));

const { SettingsDataError } = vi.hoisted(() => ({
  SettingsDataError: class SettingsDataError extends Error {
    constructor(readonly detail: string) {
      super(`settings_data: ${detail}`);
    }
  },
}));
const ensureUserDefaults = vi.fn();
vi.mock("@/features/settings/server", () => ({ SettingsDataError, ensureUserDefaults: () => ensureUserDefaults() }));

vi.mock("@/server/env", () => ({ env: { ALLOWED_EMAILS: ["pontus@example.com"] } }));

const { confirmEmailLink } = await import("./confirm-email-link");

beforeEach(() => {
  verifyEmailLink.mockReset();
  ensureUserDefaults.mockReset().mockResolvedValue(undefined);
});

describe("confirmEmailLink", () => {
  it("ensures the start data after a sign-in", async () => {
    verifyEmailLink.mockResolvedValue("signed_in");
    expect(await confirmEmailLink("hash")).toBe("signed_in");
    expect(ensureUserDefaults).toHaveBeenCalledTimes(1);
  });

  it("checks the address against ALLOWED_EMAILS", async () => {
    verifyEmailLink.mockResolvedValue("signed_in");
    await confirmEmailLink("hash");
    const isAllowed = verifyEmailLink.mock.calls[0][1] as (email: string | undefined) => boolean;
    expect(isAllowed("pontus@example.com")).toBe(true);
    expect(isAllowed("annan@example.com")).toBe(false);
  });

  it.each(["invalid", "not_allowed"])("does not touch the start data when the result is %s", async (result) => {
    verifyEmailLink.mockResolvedValue(result);
    expect(await confirmEmailLink("hash")).toBe(result);
    expect(ensureUserDefaults).not.toHaveBeenCalled();
  });

  it("signs in even when the start data fails, and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    verifyEmailLink.mockResolvedValue("signed_in");
    ensureUserDefaults.mockRejectedValue(new SettingsDataError("ensure_user_defaults 42501"));
    expect(await confirmEmailLink("hash")).toBe("signed_in");
    expect(log).toHaveBeenCalledWith("settings_defaults_failed", { reason: "ensure_user_defaults 42501" });

    ensureUserDefaults.mockRejectedValue(new Error("secret@example.com"));
    expect(await confirmEmailLink("hash")).toBe("signed_in");
    expect(log).toHaveBeenLastCalledWith("settings_defaults_failed", { reason: "unknown" });
    log.mockRestore();
  });
});

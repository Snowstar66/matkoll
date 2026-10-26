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

const { PantryDataError } = vi.hoisted(() => ({
  PantryDataError: class PantryDataError extends Error {
    constructor(readonly detail: string) {
      super(`pantry_data: ${detail}`);
    }
  },
}));
const ensurePantryDefaults = vi.fn();
vi.mock("@/features/pantry/server", () => ({ PantryDataError, ensurePantryDefaults: () => ensurePantryDefaults() }));

vi.mock("@/server/env", () => ({ env: { ALLOWED_EMAILS: ["pontus@example.com"] } }));

const { confirmEmailLink } = await import("./confirm-email-link");

beforeEach(() => {
  verifyEmailLink.mockReset();
  ensureUserDefaults.mockReset().mockResolvedValue(undefined);
  ensurePantryDefaults.mockReset().mockResolvedValue(undefined);
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
    expect(ensurePantryDefaults).not.toHaveBeenCalled();
  });

  it("ensures the pantry's start data after the settings' (AD-21)", async () => {
    const order: string[] = [];
    ensureUserDefaults.mockImplementation(async () => void order.push("settings"));
    ensurePantryDefaults.mockImplementation(async () => void order.push("pantry"));
    verifyEmailLink.mockResolvedValue("signed_in");
    expect(await confirmEmailLink("hash")).toBe("signed_in");
    expect(order).toEqual(["settings", "pantry"]);
  });

  it("ensures the pantry's start data even when the settings' fail, and the other way round", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    verifyEmailLink.mockResolvedValue("signed_in");
    ensureUserDefaults.mockRejectedValue(new SettingsDataError("ensure_user_defaults 08006"));
    expect(await confirmEmailLink("hash")).toBe("signed_in");
    expect(ensurePantryDefaults).toHaveBeenCalledTimes(1);

    ensureUserDefaults.mockReset().mockResolvedValue(undefined);
    ensurePantryDefaults.mockRejectedValue(new PantryDataError("ensure_pantry_defaults 42501"));
    expect(await confirmEmailLink("hash")).toBe("signed_in");
    expect(ensureUserDefaults).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenLastCalledWith("pantry_defaults_failed", { reason: "ensure_pantry_defaults 42501" });

    ensurePantryDefaults.mockRejectedValue(new Error("secret@example.com"));
    expect(await confirmEmailLink("hash")).toBe("signed_in");
    expect(log).toHaveBeenLastCalledWith("pantry_defaults_failed", { reason: "unknown" });
    log.mockRestore();
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

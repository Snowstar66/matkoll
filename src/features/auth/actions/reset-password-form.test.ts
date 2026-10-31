import { beforeEach, describe, expect, it, vi } from "vitest";

const resetWithToken = vi.fn();
vi.mock("../data/auth", () => ({ resetPasswordWithToken: (...args: unknown[]) => resetWithToken(...args) }));
const ensureStartData = vi.fn();
vi.mock("./ensure-start-data", () => ({ ensureStartData: () => ensureStartData() }));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("@/server/env", () => ({ env: { ALLOWED_EMAILS: ["pontus@example.com"] } }));

const { resetPasswordForm } = await import("./reset-password-form");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
const valid = { token_hash: "abc", password: "ett-nytt-lösenord-123", next: "/matsedel" };

beforeEach(() => {
  vi.restoreAllMocks();
  resetWithToken.mockReset().mockResolvedValue("done");
  ensureStartData.mockReset().mockResolvedValue(undefined);
  redirect.mockClear();
});

describe("resetPasswordForm", () => {
  it("uses the token with the new password, ensures start data and goes to next", async () => {
    await expect(resetPasswordForm(null, form(valid))).rejects.toThrow("NEXT_REDIRECT /matsedel");
    expect(resetWithToken).toHaveBeenCalledWith("abc", "ett-nytt-lösenord-123", expect.any(Function));
    const isAllowed = resetWithToken.mock.calls[0][2] as (email: string) => boolean;
    expect(isAllowed("pontus@example.com")).toBe(true);
    expect(isAllowed("annan@example.com")).toBe(false);
    expect(ensureStartData).toHaveBeenCalledTimes(1);
  });

  it("does not spend the token on a short password", async () => {
    const result = await resetPasswordForm(null, form({ ...valid, password: "kort" }));
    expect(result).toMatchObject({ ok: false, error: { code: "validation", fields: { password: expect.any(String) } } });
    expect(resetWithToken).not.toHaveBeenCalled();
  });

  it("answers an expired link and a failed save in Swedish", async () => {
    resetWithToken.mockResolvedValue("invalid");
    expect(await resetPasswordForm(null, form(valid))).toMatchObject({ ok: false, error: { code: "auth_reset_invalid" } });
    resetWithToken.mockResolvedValue("failed");
    expect(await resetPasswordForm(null, form(valid))).toMatchObject({ ok: false, error: { code: "auth_reset_failed" } });
  });

  it("sends an address outside the list to the login page with no session", async () => {
    resetWithToken.mockResolvedValue("not_allowed");
    await expect(resetPasswordForm(null, form(valid))).rejects.toThrow("NEXT_REDIRECT /logga-in?fel=atkomst");
    expect(ensureStartData).not.toHaveBeenCalled();
  });

  it("needs a token", async () => {
    expect(await resetPasswordForm(null, form({ password: valid.password }))).toMatchObject({
      ok: false,
      error: { code: "auth_reset_invalid" },
    });
  });
});

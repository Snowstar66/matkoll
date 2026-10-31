import { beforeEach, describe, expect, it, vi } from "vitest";

// createAccount with Supabase stubbed (Story 17.2): the allowlist is checked on
// the server before Supabase is asked, and nothing is created outside it.

const signUp = vi.fn();
const dropSession = vi.fn();
vi.mock("../data/auth", () => ({
  signUpWithPassword: (...args: unknown[]) => signUp(...args),
  dropCurrentSession: (...args: unknown[]) => dropSession(...args),
}));
const ensureStartData = vi.fn();
vi.mock("./ensure-start-data", () => ({ ensureStartData: () => ensureStartData() }));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("@/server/env", () => ({ env: { ALLOWED_EMAILS: ["pontus@example.com"], SITE_URL: "http://localhost:3000" } }));

const { createAccount } = await import("./create-account");
const pw = "ett-långt-lösenord";

beforeEach(() => {
  vi.restoreAllMocks();
  signUp.mockReset().mockResolvedValue({ result: "signed_in", email: "pontus@example.com" });
  dropSession.mockReset().mockResolvedValue(undefined);
  ensureStartData.mockReset().mockResolvedValue(undefined);
  redirect.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createAccount", () => {
  it("sends the confirmation mail for an allowed address (normalised) and keeps no session", async () => {
    signUp.mockResolvedValue({ result: "confirmation_sent", code: "confirmation_sent" });
    expect(await createAccount({ email: " Pontus@Example.com ", password: pw, next: "/matsedel" })).toEqual({
      ok: true,
      data: null,
    });
    expect(signUp).toHaveBeenCalledWith("pontus@example.com", pw, "http://localhost:3000/auth/confirm?next=%2Fmatsedel", {
      forwardedFor: "203.0.113.7",
    });
    expect(ensureStartData).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("signs in at once when the project needs no confirmation, ensures start data and goes to next", async () => {
    await expect(createAccount({ email: " Pontus@Example.com ", password: pw, next: "/matsedel" })).rejects.toThrow(
      "NEXT_REDIRECT /matsedel",
    );
    expect(signUp).toHaveBeenCalledWith("pontus@example.com", pw, expect.stringContaining("/auth/confirm"), { forwardedFor: "203.0.113.7" });
    expect(ensureStartData).toHaveBeenCalledTimes(1);
  });

  it("gives a friendly no and never asks Supabase for an address outside the list", async () => {
    const result = await createAccount({ email: "annan@example.com", password: pw });
    expect(result).toMatchObject({ ok: false, error: { code: "auth_signup_not_allowed" } });
    expect(signUp).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("annan@example.com");
  });

  it("refuses a short password before anything else", async () => {
    const result = await createAccount({ email: "pontus@example.com", password: "kort" });
    expect(result).toMatchObject({ ok: false, error: { code: "validation", fields: { password: expect.any(String) } } });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("says the account exists", async () => {
    signUp.mockResolvedValue({ result: "exists", code: "user_already_exists" });
    expect(await createAccount({ email: "pontus@example.com", password: pw })).toMatchObject({
      ok: false,
      error: { code: "auth_signup_exists" },
    });
  });

  it("answers a failure plainly, without Supabase's reason", async () => {
    signUp.mockResolvedValue({ result: "failed", code: "unexpected_failure" });
    const result = await createAccount({ email: "pontus@example.com", password: pw });
    expect(result).toMatchObject({ ok: false, error: { code: "auth_signup_failed" } });
    expect(JSON.stringify(result)).not.toContain("unexpected_failure");
  });

  it("signs out a session whose address turns out not to be allowed", async () => {
    signUp.mockResolvedValue({ result: "signed_in", email: "annan@example.com" });
    expect(await createAccount({ email: "pontus@example.com", password: pw })).toMatchObject({
      ok: false,
      error: { code: "auth_signup_not_allowed" },
    });
    expect(dropSession).toHaveBeenCalledTimes(1);
    expect(ensureStartData).not.toHaveBeenCalled();
  });
});

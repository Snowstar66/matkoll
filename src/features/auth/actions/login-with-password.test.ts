import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeAttempts } from "../domain/code-attempts";

// loginWithPassword with Supabase stubbed (Story 17.2): the limit first, the
// allowlist (or, Story 21.2b, the household) after Supabase, every failure the
// same auth_password_invalid.

const signIn = vi.fn();
const dropSession = vi.fn();
vi.mock("../data/auth", () => ({
  signInWithPassword: (...args: unknown[]) => signIn(...args),
  dropCurrentSession: (...args: unknown[]) => dropSession(...args),
}));
const ensureStartData = vi.fn();
vi.mock("./ensure-start-data", () => ({ ensureStartData: () => ensureStartData() }));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("@/server/env", () => ({ env: { ALLOWED_EMAILS: ["pontus@example.com"] } }));
let attempts = createCodeAttempts();
vi.mock("./password-attempt-limit", () => ({
  passwordAttempts: {
    isBlocked: (key: string) => attempts.isBlocked(key),
    recordFailure: (key: string) => attempts.recordFailure(key),
    reset: (key: string) => attempts.reset(key),
  },
}));

const { loginWithPassword } = await import("./login-with-password");
const invalid = { ok: false, error: { code: "auth_password_invalid" } };
const pontus = "pontus@example.com";

beforeEach(() => {
  vi.restoreAllMocks();
  signIn.mockReset().mockResolvedValue({ result: "invalid", code: "invalid_credentials" });
  dropSession.mockReset().mockResolvedValue(undefined);
  ensureStartData.mockReset().mockResolvedValue(undefined);
  redirect.mockClear();
  attempts = createCodeAttempts();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("loginWithPassword", () => {
  it("signs in with the normalised address, ensures start data and goes to a safe next", async () => {
    signIn.mockResolvedValue({ result: "signed_in", email: pontus });
    await expect(loginWithPassword({ email: " Pontus@Example.com ", password: "x", next: "/matsedel" })).rejects.toThrow(
      "NEXT_REDIRECT /matsedel",
    );
    expect(signIn).toHaveBeenCalledWith(pontus, "x", { forwardedFor: "203.0.113.7" });
    expect(ensureStartData).toHaveBeenCalledTimes(1);
    await expect(loginWithPassword({ email: pontus, password: "x", next: "https://evil.example" })).rejects.toThrow(
      "NEXT_REDIRECT /recept",
    );
  });

  it("gives the same answer for a wrong password, an address outside the list and a bad input", async () => {
    expect(await loginWithPassword({ email: pontus, password: "fel" })).toMatchObject(invalid);
    expect(await loginWithPassword({ email: "annan@example.com", password: "x" })).toMatchObject(invalid);
    expect(await loginWithPassword({ email: "inte en adress", password: "x" })).toMatchObject(invalid);
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(await loginWithPassword({ email: pontus, password: "" })).toMatchObject(invalid);
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("blocks after five failures, without asking Supabase, and a success resets the count", async () => {
    for (let i = 0; i < 5; i++) await loginWithPassword({ email: pontus, password: "fel" });
    expect(await loginWithPassword({ email: pontus, password: "fel" })).toMatchObject({
      ok: false,
      error: { code: "auth_password_rate_limited" },
    });
    expect(signIn).toHaveBeenCalledTimes(5);
  });

  it("passes on Supabase's own limit without counting it as a failure", async () => {
    signIn.mockResolvedValue({ result: "rate_limited", code: "over_request_rate_limit" });
    expect(await loginWithPassword({ email: pontus, password: "x" })).toMatchObject({
      ok: false,
      error: { code: "auth_password_rate_limited" },
    });
  });

  // Story 21.2b: an invited member is not on the list; the session tells whether their household lets them in.
  it("lets an invited member in through their household, asking with the list", async () => {
    signIn.mockResolvedValue({ result: "signed_in", email: "martina@example.com", viaHousehold: true });
    await expect(loginWithPassword({ email: "martina@example.com", password: "x" })).rejects.toThrow("NEXT_REDIRECT /recept");
    expect(signIn).toHaveBeenCalledWith("martina@example.com", "x", { forwardedFor: "203.0.113.7", household: ["pontus@example.com"] });
    expect(dropSession).not.toHaveBeenCalled();
  });

  it("signs out a session for an address that is not allowed after all", async () => {
    signIn.mockResolvedValue({ result: "signed_in", email: "annan@example.com", viaHousehold: false });
    expect(await loginWithPassword({ email: pontus, password: "x" })).toMatchObject(invalid);
    expect(dropSession).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("logs neither the password nor the address", async () => {
    await loginWithPassword({ email: pontus, password: "hemligt-lösen" });
    await loginWithPassword({ email: "annan@example.com", password: "hemligt-lösen" });
    const logged = JSON.stringify([vi.mocked(console.info).mock.calls, vi.mocked(console.warn).mock.calls]);
    expect(logged).not.toContain("hemligt-lösen");
    expect(logged).not.toContain("example.com");
  });
});

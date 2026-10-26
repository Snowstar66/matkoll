import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeAttempts } from "../domain/code-attempts";

// verifyEmailCode with Supabase stubbed (Story 11.6, AD-3): the app's limit
// first, the allowlist before Supabase, every failure the same
// auth_code_invalid, and neither the code nor the address in the logs.

const verifyCode = vi.fn();
vi.mock("../data/auth", () => ({ verifyEmailCode: (...args: unknown[]) => verifyCode(...args) }));
const ensureStartData = vi.fn();
vi.mock("./ensure-start-data", () => ({ ensureStartData: () => ensureStartData() }));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("@/server/env", () => ({ env: { ALLOWED_EMAILS: ["pontus@example.com"] } }));
let attempts = createCodeAttempts();
vi.mock("./code-attempt-limit", () => ({
  codeAttempts: {
    isBlocked: (key: string) => attempts.isBlocked(key),
    recordFailure: (key: string) => attempts.recordFailure(key),
    reset: (key: string) => attempts.reset(key),
  },
}));

const { verifyEmailCode } = await import("./verify-email-code");

const invalid = {
  ok: false,
  error: { code: "auth_code_invalid", message: "Koden stämmer inte eller har gått ut. Skicka en ny länk." },
};
const rateLimited = {
  ok: false,
  error: { code: "auth_code_rate_limited", message: "För många försök. Vänta en stund eller skicka en ny länk." },
};
const pontus = "pontus@example.com";

beforeEach(() => {
  vi.restoreAllMocks();
  verifyCode.mockReset().mockResolvedValue({ result: "invalid", code: "otp_expired" });
  ensureStartData.mockReset().mockResolvedValue(undefined);
  redirect.mockClear();
  requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
  attempts = createCodeAttempts();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function logged(): string {
  return JSON.stringify([vi.mocked(console.info).mock.calls, vi.mocked(console.warn).mock.calls]);
}

describe("verifyEmailCode", () => {
  it("signs in with the normalised address and code, ensures the start data and goes to next", async () => {
    verifyCode.mockResolvedValue({ result: "signed_in" });
    await expect(verifyEmailCode({ email: " Pontus@Example.com ", code: "012-345", next: "/matsedel?v=1" })).rejects.toThrow(
      "NEXT_REDIRECT /matsedel?v=1",
    );
    expect(verifyCode).toHaveBeenCalledWith(pontus, "012345", expect.any(Function), { forwardedFor: "203.0.113.7" });
    expect(ensureStartData).toHaveBeenCalledTimes(1);
  });

  it("passes no IP on when the request has none", async () => {
    requestHeaders = new Headers();
    verifyCode.mockResolvedValue({ result: "signed_in" });
    await expect(verifyEmailCode({ email: pontus, code: "123456" })).rejects.toThrow();
    expect(verifyCode.mock.calls[0][3]).toEqual({ forwardedFor: null });
  });

  it("checks the address against ALLOWED_EMAILS again after Supabase", async () => {
    verifyCode.mockResolvedValue({ result: "signed_in" });
    await expect(verifyEmailCode({ email: pontus, code: "123456" })).rejects.toThrow();
    const isAllowed = verifyCode.mock.calls[0][2] as (email: string | undefined) => boolean;
    expect(isAllowed("PONTUS@example.com")).toBe(true);
    expect(isAllowed("annan@example.com")).toBe(false);
    expect(isAllowed(undefined)).toBe(false);
  });

  it.each([undefined, "", "//evil.example", "https://evil.example", "/\\evil.example", "/%5Cevil"])(
    "goes to /recept for the next %s",
    async (next) => {
      verifyCode.mockResolvedValue({ result: "signed_in" });
      await expect(verifyEmailCode({ email: pontus, code: "123456", next })).rejects.toThrow("NEXT_REDIRECT /recept");
    },
  );

  it("answers auth_code_invalid for a wrong, expired or used code, and logs only Supabase's reason", async () => {
    expect(await verifyEmailCode({ email: pontus, code: "123456" })).toEqual(invalid);
    expect(console.info).toHaveBeenCalledWith("auth_code_refused", "otp_expired");
    expect(logged()).not.toContain(pontus);
    expect(logged()).not.toContain("123456");
    expect(ensureStartData).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("answers the same for an address outside the list without asking Supabase, and warns", async () => {
    expect(await verifyEmailCode({ email: "annan@example.com", code: "123456" })).toEqual(invalid);
    expect(verifyCode).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("auth_code_not_allowed", { ip: expect.stringMatching(/^[0-9a-f]{8}$/) });
    expect(logged()).not.toContain("annan@example.com");
    expect(logged()).not.toContain("203.0.113.7");
  });

  it("answers the same when the address is refused after Supabase", async () => {
    verifyCode.mockResolvedValue({ result: "not_allowed" });
    expect(await verifyEmailCode({ email: pontus, code: "123456" })).toEqual(invalid);
    expect(console.warn).toHaveBeenCalledWith("auth_code_not_allowed", expect.objectContaining({ after: "verify" }));
    expect(ensureStartData).not.toHaveBeenCalled();
  });

  it("answers auth_code_rate_limited when Supabase limits the checks", async () => {
    verifyCode.mockResolvedValue({ result: "rate_limited", code: "over_request_rate_limit" });
    expect(await verifyEmailCode({ email: pontus, code: "123456" })).toEqual(rateLimited);
    expect(console.warn).toHaveBeenCalledWith("auth_code_rate_limited", expect.objectContaining({ by: "supabase" }));
  });

  it.each([
    { email: pontus, code: "12a45" },
    { email: pontus, code: "12345" },
    { email: pontus, code: "1234567" },
    { email: "inte-en-adress", code: "123456" },
    { email: pontus },
  ])("answers the same without asking Supabase for %o", async (input) => {
    expect(await verifyEmailCode(input as { email: string; code: string })).toEqual(invalid);
    expect(verifyCode).not.toHaveBeenCalled();
  });

  describe("the app's limit", () => {
    it("stops after 5 wrong codes for the address and IP, without asking Supabase", async () => {
      for (let i = 0; i < 5; i++) {
        expect(await verifyEmailCode({ email: pontus, code: "123456" })).toEqual(invalid);
      }
      expect(verifyCode).toHaveBeenCalledTimes(5);
      expect(await verifyEmailCode({ email: pontus, code: "654321" })).toEqual(rateLimited);
      expect(verifyCode).toHaveBeenCalledTimes(5);
      expect(console.warn).toHaveBeenCalledWith("auth_code_rate_limited", expect.objectContaining({ by: "app" }));

      // Another IP, or another address, still gets its own five.
      requestHeaders = new Headers({ "x-forwarded-for": "198.51.100.2" });
      expect(await verifyEmailCode({ email: pontus, code: "654321" })).toEqual(invalid);
    });

    it("limits an address outside the list the same way, so the limit tells nothing", async () => {
      for (let i = 0; i < 5; i++) await verifyEmailCode({ email: "annan@example.com", code: "123456" });
      expect(await verifyEmailCode({ email: "annan@example.com", code: "123456" })).toEqual(rateLimited);
    });

    it("counts codes that are not six digits too", async () => {
      for (let i = 0; i < 5; i++) await verifyEmailCode({ email: pontus, code: "12a45" });
      expect(await verifyEmailCode({ email: pontus, code: "123456" })).toEqual(rateLimited);
    });

    it("starts over after a sign-in that worked", async () => {
      for (let i = 0; i < 4; i++) await verifyEmailCode({ email: pontus, code: "123456" });
      verifyCode.mockResolvedValueOnce({ result: "signed_in" });
      await expect(verifyEmailCode({ email: pontus, code: "123456" })).rejects.toThrow("NEXT_REDIRECT");
      for (let i = 0; i < 5; i++) {
        expect(await verifyEmailCode({ email: pontus, code: "123456" })).toEqual(invalid);
      }
    });
  });
});

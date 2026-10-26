import { beforeEach, describe, expect, it, vi } from "vitest";

// verifyEmailCode with Supabase stubbed (Story 11.6, AD-3): every failure is
// the same auth_code_invalid, and neither the code nor the address is logged.

const verifyCode = vi.fn();
vi.mock("../data/auth", () => ({ verifyEmailCode: (...args: unknown[]) => verifyCode(...args) }));
const ensureStartData = vi.fn();
vi.mock("./ensure-start-data", () => ({ ensureStartData: () => ensureStartData() }));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("@/server/env", () => ({ env: { ALLOWED_EMAILS: ["pontus@example.com"] } }));

const { verifyEmailCode } = await import("./verify-email-code");

const invalid = {
  ok: false,
  error: { code: "auth_code_invalid", message: "Koden stämmer inte eller har gått ut. Skicka en ny länk." },
};

beforeEach(() => {
  verifyCode.mockReset();
  ensureStartData.mockReset().mockResolvedValue(undefined);
  redirect.mockClear();
  vi.restoreAllMocks();
});

describe("verifyEmailCode", () => {
  it("signs in with the normalised address, ensures the start data and goes to next", async () => {
    verifyCode.mockResolvedValue({ result: "signed_in" });
    await expect(verifyEmailCode({ email: " Pontus@Example.com ", code: "012345", next: "/matsedel?v=1" })).rejects.toThrow(
      "NEXT_REDIRECT /matsedel?v=1",
    );
    expect(verifyCode).toHaveBeenCalledWith("pontus@example.com", "012345", expect.any(Function));
    expect(ensureStartData).toHaveBeenCalledTimes(1);
  });

  it("checks the address against ALLOWED_EMAILS", async () => {
    verifyCode.mockResolvedValue({ result: "signed_in" });
    await expect(verifyEmailCode({ email: "pontus@example.com", code: "123456" })).rejects.toThrow();
    const isAllowed = verifyCode.mock.calls[0][2] as (email: string | undefined) => boolean;
    expect(isAllowed("PONTUS@example.com")).toBe(true);
    expect(isAllowed("annan@example.com")).toBe(false);
    expect(isAllowed(undefined)).toBe(false);
  });

  it.each([undefined, "", "//evil.example", "https://evil.example", "/\\evil.example"])(
    "goes to /recept for the next %s",
    async (next) => {
      verifyCode.mockResolvedValue({ result: "signed_in" });
      await expect(verifyEmailCode({ email: "pontus@example.com", code: "123456", next })).rejects.toThrow(
        "NEXT_REDIRECT /recept",
      );
    },
  );

  it("answers auth_code_invalid for a wrong, expired or used code, and logs only Supabase's reason", async () => {
    verifyCode.mockResolvedValue({ result: "invalid", code: "otp_expired" });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await verifyEmailCode({ email: "pontus@example.com", code: "123456" })).toEqual(invalid);
    expect(log).toHaveBeenCalledWith("auth_code_refused", "otp_expired");
    expect(JSON.stringify(log.mock.calls)).not.toContain("pontus@example.com");
    expect(JSON.stringify(log.mock.calls)).not.toContain("123456");
    expect(ensureStartData).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("answers the same for an address outside the list", async () => {
    verifyCode.mockResolvedValue({ result: "not_allowed" });
    expect(await verifyEmailCode({ email: "pontus@example.com", code: "123456" })).toEqual(invalid);
    expect(ensureStartData).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    { email: "pontus@example.com", code: "12a45" },
    { email: "pontus@example.com", code: "12345" },
    { email: "pontus@example.com", code: "1234567" },
    { email: "inte-en-adress", code: "123456" },
    { email: "pontus@example.com" },
  ])("answers the same without asking Supabase for %o", async (input) => {
    expect(await verifyEmailCode(input as { email: string; code: string })).toEqual(invalid);
    expect(verifyCode).not.toHaveBeenCalled();
  });
});

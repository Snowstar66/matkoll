import { AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// endSession and verifyEmailCode with the session client stubbed.

const signOut = vi.fn();
const getClaims = vi.fn();
const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signOut: (...args: unknown[]) => signOut(...args),
      getClaims: () => getClaims(),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
    },
  }),
}));

const { endSession, verifyEmailCode } = await import("./auth");

const claims = { data: { claims: { sub: "user" } }, error: null };
const noClaims = { data: null, error: null };

beforeEach(() => {
  signOut.mockReset().mockResolvedValue({ error: null });
  getClaims.mockReset().mockResolvedValue(noClaims);
  verifyOtp.mockReset();
});

describe("verifyEmailCode", () => {
  const allowOnly = (allowed: string) => (email: string | undefined) => email === allowed;

  it("asks Supabase for an e-mail OTP and keeps the session of an allowed address", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { email: "pontus@example.com" } }, error: null });
    expect(await verifyEmailCode("pontus@example.com", "123456", allowOnly("pontus@example.com"))).toEqual({
      result: "signed_in",
    });
    expect(verifyOtp).toHaveBeenCalledWith({ email: "pontus@example.com", token: "123456", type: "email" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out again at once for an address outside the list", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { email: "annan@example.com" } }, error: null });
    expect(await verifyEmailCode("annan@example.com", "123456", allowOnly("pontus@example.com"))).toEqual({
      result: "not_allowed",
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("gives Supabase's code for a refused code", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "otp_expired", status: 403 } });
    expect(await verifyEmailCode("pontus@example.com", "123456", allowOnly("pontus@example.com"))).toEqual({
      result: "invalid",
      code: "otp_expired",
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("endSession", () => {
  it("signs out this browser only", async () => {
    expect(await endSession()).toEqual({ signedOut: true });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("counts a session that is left after an error as not signed out", async () => {
    signOut.mockResolvedValue({ error: { code: "unexpected_failure", status: 500 } });
    getClaims.mockResolvedValue(claims);
    expect(await endSession()).toEqual({ signedOut: false, code: "unexpected_failure" });
  });

  it("counts an error with no session left as signed out, with the code", async () => {
    signOut.mockResolvedValue({ error: { code: "unexpected_failure", status: 500 } });
    expect(await endSession()).toEqual({ signedOut: true, code: "unexpected_failure" });
  });

  it("counts a missing session from getClaims as signed out", async () => {
    signOut.mockResolvedValue({ error: { code: "unexpected_failure" } });
    getClaims.mockResolvedValue({ data: null, error: new AuthSessionMissingError() });
    expect(await endSession()).toEqual({ signedOut: true, code: "unexpected_failure" });
  });

  it("counts other getClaims errors as not signed out", async () => {
    signOut.mockResolvedValue({ error: { code: "unexpected_failure" } });
    getClaims.mockResolvedValue({ data: null, error: new AuthUnknownError("boom", null) });
    expect(await endSession()).toEqual({ signedOut: false, code: "unexpected_failure" });
  });

  it("falls back to the status when the error has no code", async () => {
    signOut.mockResolvedValue({ error: { status: 502 } });
    expect(await endSession()).toEqual({ signedOut: true, code: "502" });
  });
});

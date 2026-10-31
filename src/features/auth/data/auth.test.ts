import { AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// endSession, verifyEmailLink and verifyEmailCode with the session client stubbed.

const signOut = vi.fn();
const getClaims = vi.fn();
const verifyOtp = vi.fn();
const signInWithPasswordMock = vi.fn();
const signUpMock = vi.fn();
const updateUser = vi.fn();
const createClient = vi.fn();
const removeSessionCookies = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async (...args: unknown[]) => {
    createClient(...args);
    return {
      auth: {
        signOut: (...signOutArgs: unknown[]) => signOut(...signOutArgs),
        getClaims: () => getClaims(),
        verifyOtp: (...verifyArgs: unknown[]) => verifyOtp(...verifyArgs),
        signInWithPassword: (...a: unknown[]) => signInWithPasswordMock(...a),
        signUp: (...a: unknown[]) => signUpMock(...a),
        updateUser: (...a: unknown[]) => updateUser(...a),
      },
    };
  },
  removeSessionCookies: () => removeSessionCookies(),
}));

const { endSession, resetPasswordWithToken, signInWithPassword, signUpWithPassword, verifyEmailCode, verifyEmailLink } =
  await import("./auth");

const claims = { data: { claims: { sub: "user" } }, error: null };
const noClaims = { data: null, error: null };

beforeEach(() => {
  signOut.mockReset().mockResolvedValue({ error: null });
  getClaims.mockReset().mockResolvedValue(noClaims);
  verifyOtp.mockReset();
  signInWithPasswordMock.mockReset();
  signUpMock.mockReset();
  updateUser.mockReset();
  createClient.mockReset();
  removeSessionCookies.mockReset().mockResolvedValue(1);
  vi.restoreAllMocks();
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
    expect(removeSessionCookies).not.toHaveBeenCalled();
  });

  it("deletes the session cookies itself when signing out fails, and logs only the reason", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { email: "annan@example.com" } }, error: null });
    signOut.mockResolvedValue({ error: { code: "unexpected_failure", status: 500 } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyEmailCode("annan@example.com", "123456", allowOnly("pontus@example.com"))).toEqual({
      result: "not_allowed",
    });
    expect(removeSessionCookies).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("auth_code_signout_failed", "unexpected_failure");
    expect(JSON.stringify(log.mock.calls)).not.toContain("annan@example.com");
  });

  it("sends the browser's IP on to Supabase", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { email: "pontus@example.com" } }, error: null });
    await verifyEmailCode("pontus@example.com", "123456", allowOnly("pontus@example.com"), { forwardedFor: "203.0.113.7" });
    expect(createClient).toHaveBeenCalledWith({ forwardedFor: "203.0.113.7" });
  });

  it.each([
    [{ code: "over_request_rate_limit", status: 429 }],
    [{ status: 429 }],
  ])("gives rate_limited for Supabase's limit %o", async (error) => {
    verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error });
    expect((await verifyEmailCode("pontus@example.com", "123456", allowOnly("pontus@example.com"))).result).toBe(
      "rate_limited",
    );
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

describe("verifyEmailLink", () => {
  it("deletes the session cookies itself when signing out a refused address fails", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { email: "annan@example.com" } }, error: null });
    signOut.mockResolvedValue({ error: { code: "unexpected_failure" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyEmailLink("hash", (email) => email === "pontus@example.com")).toBe("not_allowed");
    expect(removeSessionCookies).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("auth_link_signout_failed", "unexpected_failure");
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

describe("password calls", () => {
  it("maps Supabase's answers to a small set of results", async () => {
    signInWithPasswordMock.mockResolvedValue({ data: { user: { email: "a@b.se" } }, error: null });
    expect(await signInWithPassword("a@b.se", "x")).toEqual({ result: "signed_in", email: "a@b.se" });
    for (const [error, result] of [
      [{ code: "invalid_credentials", status: 400 }, "invalid"],
      [{ code: "over_request_rate_limit", status: 429 }, "rate_limited"],
      [{ code: "unexpected_failure", status: 500 }, "failed"],
    ] as const) {
      signInWithPasswordMock.mockResolvedValue({ data: { user: null }, error });
      expect((await signInWithPassword("a@b.se", "x")).result).toBe(result);
    }
  });

  it("sign-up: exists, no session and a session", async () => {
    signUpMock.mockResolvedValue({ data: { user: null, session: null }, error: { code: "user_already_exists", status: 422 } });
    expect((await signUpWithPassword("a@b.se", "x")).result).toBe("exists");
    signUpMock.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    expect(await signUpWithPassword("a@b.se", "x")).toEqual({ result: "failed", code: "email_exists" });
    signUpMock.mockResolvedValue({ data: { user: { email: "a@b.se", identities: [{}] }, session: { access_token: "t" } }, error: null });
    expect(await signUpWithPassword("a@b.se", "x")).toEqual({ result: "signed_in", email: "a@b.se" });
  });

  it("reset: sets the password for an allowed address, in one step", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { email: "a@b.se" } }, error: null });
    updateUser.mockResolvedValue({ error: null });
    expect(await resetPasswordWithToken("hash", "nytt-lösenord", () => true)).toBe("done");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "hash", type: "recovery" });
    expect(updateUser).toHaveBeenCalledWith({ password: "nytt-lösenord" });
  });

  it("reset: a spent link, a refused address and a failed update", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: "otp_expired", status: 403 } });
    expect(await resetPasswordWithToken("hash", "pw", () => true)).toBe("invalid");

    verifyOtp.mockResolvedValue({ data: { user: { email: "x@y.se" } }, error: null });
    expect(await resetPasswordWithToken("hash", "pw", () => false)).toBe("not_allowed");
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });

    signOut.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    updateUser.mockResolvedValue({ error: { code: "same_password", status: 422 } });
    expect(await resetPasswordWithToken("hash", "pw", () => true)).toBe("failed");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

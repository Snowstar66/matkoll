import { AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// endSession with the session client stubbed.

const signOut = vi.fn();
const getClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut: (...args: unknown[]) => signOut(...args), getClaims: () => getClaims() } }),
}));

const { endSession } = await import("./auth");

const claims = { data: { claims: { sub: "user" } }, error: null };
const noClaims = { data: null, error: null };

beforeEach(() => {
  signOut.mockReset().mockResolvedValue({ error: null });
  getClaims.mockReset().mockResolvedValue(noClaims);
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

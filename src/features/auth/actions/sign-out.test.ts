import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";

// signOut with Supabase and Next's redirect stubbed.

const endSession = vi.fn();
vi.mock("../data/auth", () => ({ endSession: () => endSession() }));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
const redirect = vi.fn((url: string) => {
  throw new RedirectSignal(url);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const { signOut } = await import("./sign-out");

beforeEach(() => {
  endSession.mockReset();
  redirect.mockClear();
});

describe("signOut", () => {
  it("ends the session and sends the user to the login page", async () => {
    endSession.mockResolvedValue({ signedOut: true });
    await expect(signOut()).rejects.toThrow(RedirectSignal);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/logga-in");
  });

  it("still goes to the login page when revoking failed but the session is gone, and logs the code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    endSession.mockResolvedValue({ signedOut: true, code: "500" });
    await expect(signOut()).rejects.toThrow(RedirectSignal);
    expect(redirect).toHaveBeenCalledWith("/logga-in");
    expect(log).toHaveBeenCalledWith("auth_sign_out_revoke_failed", "500");
    log.mockRestore();
  });

  it("returns auth_sign_out_failed when a session is left, without redirecting", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    endSession.mockResolvedValue({ signedOut: false, code: "unexpected_failure" });
    expect(await signOut()).toEqual(fail("auth_sign_out_failed"));
    expect(redirect).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("auth_sign_out_failed", "unexpected_failure");
    log.mockRestore();
  });
});

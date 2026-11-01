import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeAttempts } from "../domain/code-attempts";

// joinHousehold with Supabase stubbed (Story 21.2b): sign up with the code in the metadata (the
// hook decides), or sign in, then accept the invitation as the person; no access, no session.

const signUp = vi.fn();
const getClaims = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signUp, getClaims }, rpc }) }));
const signIn = vi.fn();
const dropSession = vi.fn();
vi.mock("../data/auth", () => ({
  signInWithPassword: (...args: unknown[]) => signIn(...args),
  dropCurrentSession: (...args: unknown[]) => dropSession(...args),
}));
const letIn = vi.fn();
vi.mock("../data/household-access", () => ({ householdLetsIn: (...args: unknown[]) => letIn(...args) }));
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

const { joinHousehold } = await import("./join-household");
const martina = { code: "k7q 4mp", email: "Martina@Example.se", password: "hemligt-lösen-1" };
const joined = { data: [{ household_id: "h", household_name: "Hushållet Hellgren" }], error: null };

beforeEach(() => {
  vi.restoreAllMocks();
  signUp.mockReset().mockResolvedValue({ data: { session: {} }, error: null });
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "u" } } });
  rpc.mockReset().mockResolvedValue(joined);
  signIn.mockReset().mockResolvedValue({ result: "signed_in", email: "martina@example.se", viaHousehold: false });
  dropSession.mockReset().mockResolvedValue(undefined);
  letIn.mockReset().mockResolvedValue(true);
  attempts = createCodeAttempts();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("joinHousehold", () => {
  it("makes the account with the normalised code in its metadata and joins", async () => {
    expect(await joinHousehold({ mode: "signup", ...martina })).toEqual({ ok: true, data: { household: "Hushållet Hellgren" } });
    expect(signUp).toHaveBeenCalledWith({ email: "martina@example.se", password: "hemligt-lösen-1", options: { data: { invite_code: "K7Q4MP" } } });
    expect(rpc).toHaveBeenCalledWith("accept_household_invite", { code: "K7Q4MP" });
    expect(dropSession).not.toHaveBeenCalled();
  });

  it("says the invitation is gone when the hook refuses, and asks nothing more", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: { status: 403, code: "unexpected_failure" } });
    expect(await joinHousehold({ mode: "signup", ...martina })).toMatchObject({ ok: false, error: { code: "household_invite_gone" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a code that cannot be one before asking Supabase", async () => {
    expect(await joinHousehold({ mode: "signup", ...martina, code: "K7Q4M0" })).toMatchObject({ ok: false, error: { code: "household_invite_gone" } });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("checks the fields and the length of a new password", async () => {
    expect(await joinHousehold({ mode: "signup", ...martina, email: "nej" })).toMatchObject({ ok: false, error: { code: "validation", fields: { email: expect.any(String) } } });
    expect(await joinHousehold({ mode: "signup", ...martina, password: "kort" })).toMatchObject({ ok: false, error: { fields: { password: expect.any(String) } } });
    signUp.mockResolvedValue({ data: { session: null }, error: { status: 422, code: "user_already_exists" } });
    expect(await joinHousehold({ mode: "signup", ...martina })).toMatchObject({ ok: false, error: { code: "household_account_exists" } });
  });

  it("signs out a new account whose code was used up in between", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    letIn.mockResolvedValue(false);
    expect(await joinHousehold({ mode: "signup", ...martina })).toMatchObject({ ok: false, error: { code: "household_invite_gone" } });
    expect(dropSession).toHaveBeenCalledTimes(1);
  });

  it("signs in an existing account with the login page's limit, and joins", async () => {
    expect((await joinHousehold({ mode: "login", ...martina })).ok).toBe(true);
    expect(signIn).toHaveBeenCalledWith("martina@example.se", "hemligt-lösen-1", { forwardedFor: "203.0.113.7" });
    signIn.mockResolvedValue({ result: "invalid", code: "invalid_credentials" });
    for (let i = 0; i < 5; i++) await joinHousehold({ mode: "login", ...martina });
    expect(await joinHousehold({ mode: "login", ...martina })).toMatchObject({ ok: false, error: { code: "auth_password_rate_limited" } });
  });

  it("joins with the session there is, and turns the database's refusals into messages", async () => {
    expect((await joinHousehold({ mode: "session", code: "K7Q4MP" })).ok).toBe(true);
    rpc.mockResolvedValue({ data: null, error: { code: "MK452" } });
    expect(await joinHousehold({ mode: "session", code: "K7Q4MP" })).toMatchObject({ ok: false, error: { code: "household_has_data" } });
    rpc.mockResolvedValue({ data: null, error: { code: "MK451" } });
    expect(await joinHousehold({ mode: "session", code: "K7Q4MP" })).toMatchObject({ ok: false, error: { code: "household_invite_locked" } });
    getClaims.mockResolvedValue({ data: null });
    expect(await joinHousehold({ mode: "session", code: "K7Q4MP" })).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  });

  it("logs neither the code, the address nor the password", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: { status: 403 } });
    await joinHousehold({ mode: "signup", ...martina });
    const logged = JSON.stringify([vi.mocked(console.warn).mock.calls, vi.mocked(console.error).mock.calls]);
    for (const secret of ["K7Q4MP", "example.se", "hemligt-lösen-1"]) expect(logged).not.toContain(secret);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeAttempts } from "../domain/code-attempts";

// joinAppInvite with Supabase stubbed (Story 21.1): sign up with the app code in the metadata (the
// hook decides it names this address), or sign in, then claim the invitation as the person; no
// access, no session.

vi.mock("server-only", () => ({}));
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
const startData = vi.fn();
vi.mock("./ensure-start-data", () => ({ ensureStartData: () => startData() }));
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

const { joinAppInvite } = await import("./join-app-invite");
const anna = { code: "k7q4 mp2x", email: "Anna@Example.se", password: "hemligt-lösen-1" };

beforeEach(() => {
  vi.restoreAllMocks();
  signUp.mockReset().mockResolvedValue({ data: { session: {} }, error: null });
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "u" } } });
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  signIn.mockReset().mockResolvedValue({ result: "signed_in", email: "anna@example.se", viaHousehold: false });
  dropSession.mockReset().mockResolvedValue(undefined);
  letIn.mockReset().mockResolvedValue(true);
  startData.mockReset().mockResolvedValue(undefined);
  attempts = createCodeAttempts();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("joinAppInvite", () => {
  it("makes the account with the normalised app code in its metadata, claims it and starts the account", async () => {
    expect(await joinAppInvite({ mode: "signup", ...anna })).toEqual({ ok: true, data: null });
    expect(signUp).toHaveBeenCalledWith({ email: "anna@example.se", password: "hemligt-lösen-1", options: { data: { app_invite_code: "K7Q4MP2X" } } });
    expect(rpc).toHaveBeenCalledWith("claim_app_invite", { code: "K7Q4MP2X" });
    expect(startData).toHaveBeenCalled();
    expect(dropSession).not.toHaveBeenCalled();
  });

  it("says the invitation is gone when the hook refuses, and claims nothing", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: { status: 403, code: "unexpected_failure" } });
    expect(await joinAppInvite({ mode: "signup", ...anna })).toMatchObject({ ok: false, error: { code: "app_invite_gone" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a household code's length, and an address on ALLOWED_EMAILS, before asking Supabase", async () => {
    expect(await joinAppInvite({ mode: "signup", ...anna, code: "K7Q4MP" })).toMatchObject({ ok: false, error: { code: "app_invite_gone" } });
    expect(await joinAppInvite({ mode: "signup", ...anna, email: "Pontus@Example.com" })).toMatchObject({ ok: false, error: { code: "app_invite_gone" } });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("checks the fields and the length of a new password", async () => {
    expect(await joinAppInvite({ mode: "signup", ...anna, email: "nej" })).toMatchObject({ ok: false, error: { code: "validation", fields: { email: expect.any(String) } } });
    expect(await joinAppInvite({ mode: "signup", ...anna, password: "kort" })).toMatchObject({ ok: false, error: { fields: { password: expect.any(String) } } });
    signUp.mockResolvedValue({ data: { session: null }, error: { status: 422, code: "user_already_exists" } });
    expect(await joinAppInvite({ mode: "signup", ...anna })).toMatchObject({ ok: false, error: { code: "household_account_exists" } });
  });

  it("signs out a person who ends up without access, whether the claim worked or not", async () => {
    letIn.mockResolvedValue(false);
    expect(await joinAppInvite({ mode: "signup", ...anna })).toMatchObject({ ok: false, error: { code: "app_invite_join_failed" } });
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await joinAppInvite({ mode: "signup", ...anna, email: "other@example.se" })).toMatchObject({ ok: false, error: { code: "app_invite_gone" } });
    expect(dropSession).toHaveBeenCalledTimes(2);
  });

  it("keeps the session of someone with access whose claim fails, such as an allowed address", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    signIn.mockResolvedValue({ result: "signed_in", email: "pontus@example.com", viaHousehold: false });
    expect(await joinAppInvite({ mode: "login", ...anna, email: "pontus@example.com" })).toMatchObject({ ok: false, error: { code: "app_invite_gone" } });
    expect(dropSession).not.toHaveBeenCalled();
  });

  it("signs in with the same limit as the login page, then claims", async () => {
    expect(await joinAppInvite({ mode: "login", ...anna })).toEqual({ ok: true, data: null });
    signIn.mockResolvedValue({ result: "invalid", code: "invalid_credentials" });
    for (let i = 0; i < 6; i += 1) await joinAppInvite({ mode: "login", ...anna });
    expect(await joinAppInvite({ mode: "login", ...anna })).toMatchObject({ ok: false, error: { code: "auth_password_rate_limited" } });
  });

  it("uses the session there is, and needs one", async () => {
    expect(await joinAppInvite({ mode: "session", code: anna.code })).toEqual({ ok: true, data: null });
    expect(signUp).not.toHaveBeenCalled();
    getClaims.mockResolvedValue({ data: { claims: null } });
    expect(await joinAppInvite({ mode: "session", code: anna.code })).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  });

  it("tells too many wrong codes apart and logs no address or code", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "MK451" } });
    expect(await joinAppInvite({ mode: "session", code: anna.code })).toMatchObject({ ok: false, error: { code: "household_invite_locked" } });
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await joinAppInvite({ mode: "session", code: anna.code });
    const logged = JSON.stringify([...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls]);
    expect(logged).not.toContain("K7Q4MP2X");
    expect(logged).not.toContain("anna@example.se");
  });
});

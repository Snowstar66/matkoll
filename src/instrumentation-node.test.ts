import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: {} }));
vi.mock("@/lib/supabase/config", () => ({ supabaseConfig: () => ({ url: "http://x", key: "k" }) }));

const { accessTokenFromCookies } = await import("./instrumentation-node");

// The server reporter reads the user's access token from the cookie and never refreshes it.

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (exp: number) => `${b64({ alg: "none" })}.${b64({ exp })}.sig`;
const now = 1_800_000_000;

describe("accessTokenFromCookies", () => {
  it("reads a valid token from a plain, a base64- and a chunked cookie", () => {
    const token = jwt(now + 600);
    const session = JSON.stringify({ access_token: token, refresh_token: "r" });
    expect(accessTokenFromCookies(`a=1; sb-ref-auth-token=${encodeURIComponent(session)}`, now)).toBe(token);
    expect(accessTokenFromCookies(`sb-ref-auth-token=base64-${Buffer.from(session).toString("base64url")}`, now)).toBe(token);
    const half = Math.floor(session.length / 2);
    const chunks = `sb-ref-auth-token.1=${encodeURIComponent(session.slice(half))}; sb-ref-auth-token.0=${encodeURIComponent(session.slice(0, half))}`;
    expect(accessTokenFromCookies(chunks, now)).toBe(token);
  });

  it("returns null when expired, missing or broken", () => {
    const expired = JSON.stringify({ access_token: jwt(now + 5), refresh_token: "r" });
    expect(accessTokenFromCookies(`sb-ref-auth-token=${encodeURIComponent(expired)}`, now)).toBeNull();
    expect(accessTokenFromCookies("a=1", now)).toBeNull();
    expect(accessTokenFromCookies("", now)).toBeNull();
    expect(accessTokenFromCookies("sb-ref-auth-token=not-json", now)).toBeNull();
  });
});

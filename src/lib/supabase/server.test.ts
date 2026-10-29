import { beforeEach, describe, expect, it, vi } from "vitest";

// The session client (Story 11.6): the browser's IP goes to Supabase Auth as
// Sb-Forwarded-For, and removeSessionCookies deletes every chunk of the
// session cookie and nothing else.

const createServerClient = vi.fn<(...args: unknown[]) => object>(() => ({}));
vi.mock("@supabase/ssr", () => ({ createServerClient: (...args: unknown[]) => createServerClient(...args) }));
const jar = new Map<string, string>();
const cookieStore = {
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => jar.set(name, value),
  delete: (name: string) => jar.delete(name),
};
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./config", () => ({
  supabaseConfig: () => ({ url: "http://127.0.0.1:54321", key: "publishable" }),
  authCookieOptions: () => ({ maxAge: 7_776_000, httpOnly: true, sameSite: "lax", path: "/", secure: false }),
}));

const { createClient, removeSessionCookies } = await import("./server");

beforeEach(() => {
  createServerClient.mockClear();
  jar.clear();
});

describe("createClient", () => {
  it("sends the browser's IP as Sb-Forwarded-For", async () => {
    await createClient({ forwardedFor: "203.0.113.7" });
    const options = createServerClient.mock.calls[0][2] as { global?: { headers?: Record<string, string> } };
    expect(options.global?.headers).toEqual({ "Sb-Forwarded-For": "203.0.113.7" });
  });

  it.each([undefined, null, ""])("sends no such header for %s", async (forwardedFor) => {
    await createClient({ forwardedFor });
    const options = createServerClient.mock.calls[0][2] as { global?: unknown };
    expect(options.global).toBeUndefined();
  });
});

describe("removeSessionCookies", () => {
  it("deletes the session cookie and its chunks, but not the PKCE verifier or other cookies", async () => {
    for (const name of [
      "sb-127-auth-token",
      "sb-127-auth-token.0",
      "sb-127-auth-token.1",
      "sb-127-auth-token-code-verifier",
      "matkoll-other",
    ]) {
      jar.set(name, "x");
    }
    expect(await removeSessionCookies()).toBe(3);
    expect([...jar.keys()]).toEqual(["sb-127-auth-token-code-verifier", "matkoll-other"]);
  });
});

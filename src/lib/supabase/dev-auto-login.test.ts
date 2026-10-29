import { describe, expect, it } from "vitest";
import { devAutoLoginCredentials, isLocalHost, isLocalUrl, type DevAutoLoginInput } from "./dev-auto-login";

const ok: DevAutoLoginInput = {
  nodeEnv: "development",
  vercel: undefined,
  host: "localhost:3000",
  email: "dev@example.test",
  password: "secret-pw",
  supabaseUrl: "http://127.0.0.1:54321",
};

describe("devAutoLoginCredentials", () => {
  it("returns the credentials when every guard holds", () => {
    expect(devAutoLoginCredentials(ok)).toEqual({ email: "dev@example.test", password: "secret-pw" });
    expect(devAutoLoginCredentials({ ...ok, host: "127.0.0.1:3100" })).not.toBeNull();
  });

  it("is inert in production and test", () => {
    expect(devAutoLoginCredentials({ ...ok, nodeEnv: "production" })).toBeNull();
    expect(devAutoLoginCredentials({ ...ok, nodeEnv: "test" })).toBeNull();
    expect(devAutoLoginCredentials({ ...ok, nodeEnv: undefined })).toBeNull();
  });

  it("is inert on Vercel", () => {
    expect(devAutoLoginCredentials({ ...ok, vercel: "1" })).toBeNull();
  });

  it("is inert for any host but localhost and 127.0.0.1", () => {
    for (const host of [null, "", "matkoll.vercel.app", "example.com", "localhost.evil.com", "evil.com:3000", "192.168.1.5:3000", "[::1]:3000", "localhost@evil.com"]) {
      expect(devAutoLoginCredentials({ ...ok, host })).toBeNull();
    }
  });

  it("is inert when a forwarded host is not local", () => {
    expect(devAutoLoginCredentials({ ...ok, forwardedHost: "matkoll.example.com" })).toBeNull();
    expect(devAutoLoginCredentials({ ...ok, forwardedHost: "localhost:3000" })).not.toBeNull();
  });

  it("is inert without both credentials", () => {
    expect(devAutoLoginCredentials({ ...ok, email: undefined })).toBeNull();
    expect(devAutoLoginCredentials({ ...ok, email: "  " })).toBeNull();
    expect(devAutoLoginCredentials({ ...ok, password: undefined })).toBeNull();
    expect(devAutoLoginCredentials({ ...ok, password: "" })).toBeNull();
  });

  it("is inert unless Supabase is local", () => {
    expect(devAutoLoginCredentials({ ...ok, supabaseUrl: "https://abc.supabase.co" })).toBeNull();
    expect(devAutoLoginCredentials({ ...ok, supabaseUrl: "http://localhost.evil.com" })).toBeNull();
    expect(devAutoLoginCredentials({ ...ok, supabaseUrl: undefined })).toBeNull();
    expect(devAutoLoginCredentials({ ...ok, supabaseUrl: "not a url" })).toBeNull();
  });
});

describe("isLocalHost and isLocalUrl", () => {
  it("accept only the two local names", () => {
    expect(isLocalHost("LOCALHOST:3000")).toBe(true);
    expect(isLocalHost("127.0.0.2")).toBe(false);
    expect(isLocalUrl("http://localhost:54321")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1.evil.com")).toBe(false);
  });
});

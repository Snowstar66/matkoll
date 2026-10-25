import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvError, envSchema, parseEnv } from "./env-schema";

describe("parseEnv", () => {
  it("accepts an empty environment and defaults AI_PROVIDER to mock", () => {
    const env = parseEnv({});
    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.ALLOWED_EMAILS).toBeUndefined();
  });

  it("parses a complete valid environment", () => {
    const env = parseEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      ALLOWED_EMAILS: " Pontus@Example.com, other@example.com ,",
      AI_PROVIDER: "lmstudio",
      AI_MODEL: "qwen3.6-35b-a3b",
      LMSTUDIO_BASE_URL: "http://localhost:1234/v1",
    });
    expect(env.AI_PROVIDER).toBe("lmstudio");
    expect(env.ALLOWED_EMAILS).toEqual(["pontus@example.com", "other@example.com"]);
    expect(env.LMSTUDIO_BASE_URL).toBe("http://localhost:1234/v1");
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ AI_PROVIDER: "", OPENAI_API_KEY: "", LMSTUDIO_BASE_URL: "" });
    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.LMSTUDIO_BASE_URL).toBeUndefined();
  });

  it("rejects an unknown AI_PROVIDER, naming the variable but not the value", () => {
    const secretLooking = "foo-sk-do-not-log";
    let error: unknown;
    try {
      parseEnv({ AI_PROVIDER: secretLooking });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EnvError);
    const envError = error as EnvError;
    expect(envError.variables).toEqual(["AI_PROVIDER"]);
    expect(envError.message).toContain("AI_PROVIDER");
    expect(envError.message).not.toContain(secretLooking);
    expect(JSON.stringify(envError)).not.toContain(secretLooking);
  });

  it("rejects invalid URLs and email lists without echoing the values", () => {
    expect(() =>
      parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "not a url", ALLOWED_EMAILS: "nobody" }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL.*ALLOWED_EMAILS/);
    expect(() => parseEnv({ ALLOWED_EMAILS: "nobody" })).toThrowError(
      expect.objectContaining({ message: expect.not.stringContaining("nobody") }),
    );
  });

  it("defaults SITE_URL outside production and requires it in production", () => {
    expect(parseEnv({}).SITE_URL).toBe("http://localhost:3000");
    expect(parseEnv({ NODE_ENV: "test" }).SITE_URL).toBe("http://localhost:3000");
    expect(parseEnv({ SITE_URL: "https://matkoll.example.com" }).SITE_URL).toBe("https://matkoll.example.com");
    expect(parseEnv({ NODE_ENV: "production", SITE_URL: "https://matkoll.example.com" }).SITE_URL).toBe(
      "https://matkoll.example.com",
    );
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrowError(
      expect.objectContaining({ name: "EnvError", variables: ["SITE_URL"] }),
    );
    expect(() => parseEnv({ NODE_ENV: "production", SITE_URL: "" })).toThrowError(EnvError);
    expect(() => parseEnv({ SITE_URL: "ftp://example.com" })).toThrowError(EnvError);
  });

  it("accepts only http and https URLs", () => {
    expect(parseEnv({ LMSTUDIO_BASE_URL: "https://lmstudio.example.com/v1" }).LMSTUDIO_BASE_URL).toBe(
      "https://lmstudio.example.com/v1",
    );
    for (const url of ["ftp://example.com", "file:///etc/passwd", "javascript:alert(1)"]) {
      expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_URL: url })).toThrowError(EnvError);
      expect(() => parseEnv({ LMSTUDIO_BASE_URL: url })).toThrowError(EnvError);
    }
  });
});

describe(".env.example", () => {
  const scriptsMarker = "# --- scripts and tests only ---";
  const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
  const [appPart, scriptsPart = ""] = example.split(scriptsMarker);
  const namesIn = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("=")[0].trim());

  it("lists exactly the app's variables above the scripts-and-tests marker", () => {
    expect([...namesIn(appPart)].sort()).toEqual(Object.keys(envSchema.shape).sort());
  });

  it("keeps script and test variables out of the app schema", () => {
    expect(example).toContain(scriptsMarker);
    const scriptNames = namesIn(scriptsPart);
    expect(scriptNames.length).toBeGreaterThan(0);
    for (const name of scriptNames) {
      expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(Object.keys(envSchema.shape)).not.toContain(name);
    }
    expect(Object.keys(envSchema.shape).filter((name) => /SERVICE_ROLE|SECRET_KEY/.test(name))).toEqual([]);
  });
});

describe("env.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails on import when process.env is invalid", async () => {
    vi.stubEnv("AI_PROVIDER", "foo");
    vi.resetModules();
    await expect(import("@/server/env")).rejects.toMatchObject({
      name: "EnvError",
      variables: ["AI_PROVIDER"],
    });
  });
});

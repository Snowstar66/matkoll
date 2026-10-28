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

  it("reads AI_MOCK_DELAY_MS as whole milliseconds from 0 to 30 000, and treats an empty one as unset (Story 12.4)", () => {
    expect(parseEnv({ AI_MOCK_DELAY_MS: "3000" }).AI_MOCK_DELAY_MS).toBe(3000);
    expect(parseEnv({ AI_MOCK_DELAY_MS: "0" }).AI_MOCK_DELAY_MS).toBe(0);
    expect(parseEnv({ AI_MOCK_DELAY_MS: "30000" }).AI_MOCK_DELAY_MS).toBe(30_000);
    expect(parseEnv({ AI_MOCK_DELAY_MS: "" }).AI_MOCK_DELAY_MS).toBeUndefined();
    expect(parseEnv({}).AI_MOCK_DELAY_MS).toBeUndefined();
    for (const bad of ["-1", "30001", "1.5", "slow"]) {
      expect(() => parseEnv({ AI_MOCK_DELAY_MS: bad }), bad).toThrow(EnvError);
    }
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
    const production = { NODE_ENV: "production", AI_PROVIDER: "mock" };
    expect(parseEnv({ ...production, SITE_URL: "https://matkoll.example.com" }).SITE_URL).toBe(
      "https://matkoll.example.com",
    );
    expect(() => parseEnv(production)).toThrowError(
      expect.objectContaining({ name: "EnvError", variables: ["SITE_URL"] }),
    );
    expect(() => parseEnv({ ...production, SITE_URL: "" })).toThrowError(EnvError);
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

describe("parseEnv: AI settings fit together", () => {
  const thrown = (source: Record<string, string>) => {
    try {
      parseEnv(source);
    } catch (error) {
      return error as EnvError;
    }
    throw new Error("expected parseEnv to throw");
  };

  it("needs nothing for mock", () => {
    expect(parseEnv({ AI_PROVIDER: "mock" }).AI_MODEL).toBeUndefined();
  });

  it("requires LMSTUDIO_BASE_URL for lmstudio and defaults AI_MODEL to the tested model", () => {
    const error = thrown({ AI_PROVIDER: "lmstudio" });
    expect(error).toBeInstanceOf(EnvError);
    expect(error.variables).toEqual(["LMSTUDIO_BASE_URL"]);

    const env = parseEnv({ AI_PROVIDER: "lmstudio", LMSTUDIO_BASE_URL: "http://localhost:1234/v1" });
    expect(env.AI_MODEL).toBe("qwen/qwen3.6-35b-a3b");
    expect(
      parseEnv({ AI_PROVIDER: "lmstudio", LMSTUDIO_BASE_URL: "http://localhost:1234/v1", AI_MODEL: "other" })
        .AI_MODEL,
    ).toBe("other");
  });

  it.each([
    ["anthropic", "ANTHROPIC_API_KEY"],
    ["openai", "OPENAI_API_KEY"],
  ])("requires the key and AI_MODEL for %s", (provider, keyName) => {
    expect(thrown({ AI_PROVIDER: provider }).variables).toEqual([keyName, "AI_MODEL"]);
    expect(thrown({ AI_PROVIDER: provider, [keyName]: "sk-secret-value" }).variables).toEqual(["AI_MODEL"]);
    expect(thrown({ AI_PROVIDER: provider, AI_MODEL: "model" }).variables).toEqual([keyName]);
    const env = parseEnv({ AI_PROVIDER: provider, [keyName]: "sk-secret-value", AI_MODEL: "model" });
    expect(env.AI_MODEL).toBe("model");
  });

  it("does not echo the key when another setting is missing", () => {
    const error = thrown({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-secret-value" });
    expect(error.message).toContain("AI_MODEL");
    expect(error.message).not.toContain("sk-secret-value");
  });

  it.each([["CF_ACCESS_CLIENT_ID"], ["CF_ACCESS_CLIENT_SECRET"]])(
    "rejects %s without its pair, naming both",
    (name) => {
      const error = thrown({ [name]: "token-value" });
      expect(error.variables).toEqual(["CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"]);
      expect(error.message).not.toContain("token-value");
    },
  );

  it("accepts the Cloudflare Access pair", () => {
    const env = parseEnv({
      AI_PROVIDER: "lmstudio",
      LMSTUDIO_BASE_URL: "https://lmstudio.example.com/v1",
      CF_ACCESS_CLIENT_ID: "id",
      CF_ACCESS_CLIENT_SECRET: "secret",
    });
    expect(env.CF_ACCESS_CLIENT_ID).toBe("id");
  });

  it("requires AI_PROVIDER in production, and allows the mock there only when set explicitly", () => {
    const site = { NODE_ENV: "production", SITE_URL: "https://matkoll.example.com" };
    expect(thrown(site).variables).toEqual(["AI_PROVIDER"]);
    expect(thrown({ ...site, AI_PROVIDER: " " }).variables).toEqual(["AI_PROVIDER"]);
    expect(parseEnv({ ...site, AI_PROVIDER: "mock" }).AI_PROVIDER).toBe("mock");
    expect(parseEnv({ NODE_ENV: "development" }).AI_PROVIDER).toBe("mock");
  });

  it("treats whitespace-only values as unset", () => {
    expect(thrown({ AI_PROVIDER: "openai", OPENAI_API_KEY: "key", AI_MODEL: "  " }).variables).toEqual(["AI_MODEL"]);
    expect(thrown({ AI_PROVIDER: "openai", OPENAI_API_KEY: "\t", AI_MODEL: "m" }).variables).toEqual([
      "OPENAI_API_KEY",
    ]);
    expect(parseEnv({ CF_ACCESS_CLIENT_ID: " ", CF_ACCESS_CLIENT_SECRET: "" }).CF_ACCESS_CLIENT_ID).toBeUndefined();
  });

  it("requires https for LM Studio when the Cloudflare Access pair is set", () => {
    const pair = { AI_PROVIDER: "lmstudio", CF_ACCESS_CLIENT_ID: "id", CF_ACCESS_CLIENT_SECRET: "secret" };
    const error = thrown({ ...pair, LMSTUDIO_BASE_URL: "http://lmstudio.example.com/v1" });
    expect(error.variables).toEqual(["LMSTUDIO_BASE_URL"]);
    expect(error.message).not.toContain("secret");
    expect(parseEnv({ ...pair, LMSTUDIO_BASE_URL: "https://lmstudio.example.com/v1" }).LMSTUDIO_BASE_URL).toBe(
      "https://lmstudio.example.com/v1",
    );
  });

  it("reports AI problems and a missing SITE_URL together", () => {
    expect(thrown({ NODE_ENV: "production", AI_PROVIDER: "lmstudio" }).variables).toEqual([
      "LMSTUDIO_BASE_URL",
      "SITE_URL",
    ]);
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

import { describe, expect, it } from "vitest";
import {
  areaOfPath,
  buildErrorReport,
  createReportGate,
  isIgnorableError,
  rawErrorOf,
  reportKey,
  reportPath,
  reportVersion,
  scrubText,
  stackExcerpt,
} from "./error-report";

// Automatic error reports: what is scrubbed, what is ignored, what is deduped.

const base = { name: "TypeError", message: "x is undefined", stack: null, digest: null, path: "/recept", source: "boundary" } as const;

describe("scrubText", () => {
  it("takes out e-mail addresses, tokens, keys and cookies", () => {
    expect(scrubText("Kunde inte nå anna.svensson@example.se")).toBe("Kunde inte nå [e-post]");
    const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "abcdefghijk"].join(".");
    expect(scrubText(`jwt ${jwt}`)).toBe("jwt [dold]");
    expect(scrubText("Authorization: Bearer abcdef1234567890")).not.toContain("abcdef");
    expect(scrubText("token=abc123 and password: hunter2")).toBe("token=[dold] and password: [dold]");
    expect(scrubText("cookie sb-abcdefg-auth-token.0 failed")).toBe("cookie [dold] failed");
    expect(scrubText("key a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3")).toContain("[dold]");
  });

  it("removes query strings and fragments from addresses and paths", () => {
    expect(scrubText("GET https://livskoll.vercel.app/api/x?code=123&name=Anna failed")).toBe("GET https://livskoll.vercel.app/api/x failed");
    expect(scrubText("at /recept/abc?q=kyckling#top")).toBe("at /recept/abc");
  });

  it("leaves ordinary text alone", () => {
    expect(scrubText("Cannot read properties of undefined (reading 'map')")).toBe("Cannot read properties of undefined (reading 'map')");
  });
});

describe("reportPath and areaOfPath", () => {
  it("keeps the path only, hides ids, and refuses what is not a path", () => {
    expect(reportPath("/recept/3f2b8c1e-1111-4222-8333-444455556666?x=1#a")).toBe("/recept/[id]");
    expect(reportPath("https://evil.example/x")).toBeNull();
    expect(reportPath("/a b")).toBeNull();
    expect(reportPath(`/${"x".repeat(500)}`)?.length).toBe(200);
  });

  it("maps the tabs to help areas", () => {
    expect(areaOfPath("/lista")).toBe("inkopslista");
    expect(areaOfPath("/hemma/x")).toBe("matvaror");
    expect(areaOfPath("/hjalp")).toBeNull();
    expect(areaOfPath(null)).toBeNull();
  });
});

describe("stackExcerpt", () => {
  it("keeps the first frames, scrubbed, within 1000 characters", () => {
    const frames = Array.from({ length: 30 }, (_, index) => `    at fn${index} (https://x.se/_next/static/chunk.js?v=secret:${index}:1)`);
    const excerpt = stackExcerpt(["TypeError: x", ...frames].join("\n"));
    expect(excerpt.split("\n")).toHaveLength(6);
    expect(excerpt).not.toContain("secret");
    expect(excerpt.length).toBeLessThanOrEqual(1000);
    expect(stackExcerpt(null)).toBe("");
  });
});

describe("isIgnorableError", () => {
  const ignored = (name: string, message: string, online = true, digest: string | null = null) =>
    isIgnorableError({ name, message, stack: null, digest }, { online });

  it("ignores redirect, notFound and other control flow", () => {
    expect(ignored("Error", "NEXT_REDIRECT")).toBe(true);
    expect(ignored("Error", "x", true, "NEXT_HTTP_ERROR_FALLBACK;404")).toBe(true);
    expect(ignored("Error", "NEXT_NOT_FOUND")).toBe(true);
  });

  it("ignores aborted fetches, unauthorized, ResizeObserver and cross-origin script errors", () => {
    expect(ignored("AbortError", "The operation was aborted.")).toBe(true);
    expect(ignored("Error", "signal is aborted without reason")).toBe(true);
    expect(ignored("Error", "unauthorized")).toBe(true);
    expect(ignored("Error", "ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(ignored("Error", "Script error.")).toBe(true);
  });

  it("ignores network errors only while offline", () => {
    expect(ignored("TypeError", "Failed to fetch", false)).toBe(true);
    expect(ignored("TypeError", "Load failed", false)).toBe(true);
    expect(ignored("TypeError", "Failed to fetch", true)).toBe(false);
  });

  it("does not ignore a real error", () => {
    expect(ignored("TypeError", "Cannot read properties of undefined")).toBe(false);
  });
});

describe("buildErrorReport", () => {
  it("makes a short, scrubbed body with the page, the area and the digest", () => {
    const report = buildErrorReport({
      ...base,
      message: "Kunde inte spara för anna@example.se (token=abc123)",
      stack: "TypeError: x\n    at save (https://x.se/a.js?k=1:1:1)",
      digest: "1234567890",
      path: "/recept/3f2b8c1e-1111-4222-8333-444455556666?q=kyckling",
    });
    expect(report).toEqual({
      body: "TypeError: Kunde inte spara för [e-post] (token=[dold]) [sidan kraschade]\nat save (https://x.se/a.js)",
      page: "/recept/[id]",
      area: "recept",
      digest: "1234567890",
    });
  });

  it("cuts a long message and never exceeds 2000 characters", () => {
    const report = buildErrorReport({
      ...base,
      message: "ord ".repeat(2000),
      stack: Array.from({ length: 40 }, () => `at ${"f".repeat(300)}`).join("\n"),
    });
    expect(report!.body.length).toBeLessThan(2000);
  });

  it("returns null for an expected error", () => {
    expect(buildErrorReport({ ...base, message: "NEXT_REDIRECT" })).toBeNull();
    expect(buildErrorReport({ ...base, name: "TypeError", message: "Failed to fetch" }, { online: false })).toBeNull();
  });

  it("copes with a missing message", () => {
    expect(buildErrorReport({ ...base, message: "" })!.body).toContain("(inget meddelande)");
  });
});

describe("rawErrorOf", () => {
  it("reads an Error, a digest and a plain string", () => {
    const error = Object.assign(new RangeError("för stort"), { digest: "99" });
    expect(rawErrorOf(error)).toMatchObject({ name: "RangeError", message: "för stort", digest: "99" });
    expect(rawErrorOf("bara text")).toMatchObject({ name: "Error", message: "bara text", stack: null });
    expect(rawErrorOf(undefined)).toMatchObject({ message: "" });
  });
});

describe("dedupe and cap", () => {
  it("lets the same error through once per path, and stops at the cap", () => {
    const gate = createReportGate(3);
    const key = reportKey({ message: "boom", digest: null }, "/recept?x=1");
    expect(key).toBe(reportKey({ message: "boom", digest: null }, "/recept?y=2"));
    expect(gate.allow(key)).toBe(true);
    expect(gate.allow(key)).toBe(false);
    expect(gate.allow(reportKey({ message: "boom", digest: null }, "/lista"))).toBe(true);
    expect(gate.allow("c")).toBe(true);
    expect(gate.allow("d")).toBe(false);
  });

  it("prefers the digest to tell errors apart", () => {
    expect(reportKey({ message: "generic", digest: "1" }, "/x")).not.toBe(reportKey({ message: "generic", digest: "2" }, "/x"));
  });
});

describe("reportVersion", () => {
  it("adds the commit's first seven characters", () => {
    expect(reportVersion({ version: "0.1.0", commit: "abcdef1234567" })).toBe("0.1.0+abcdef1");
    expect(reportVersion({ version: "0.1.0", commit: null })).toBe("0.1.0");
  });
});

import { describe, expect, it } from "vitest";
import { defaultNextPath, safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it.each([
    ["/recept", "/recept"],
    ["/recept/123?flik=steg", "/recept/123?flik=steg"],
    ["/", "/"],
    ["/recept#steg-2", "/recept#steg-2"],
    ["/a/../recept", "/recept"],
    ["/recept?q=gr%C3%A4dde", "/recept?q=gr%C3%A4dde"],
    [`/${"a".repeat(511)}`, `/${"a".repeat(511)}`],
  ])("keeps the same-site path %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/recept"],
    ["absolute URL", "https://evil.com"],
    ["backslash", "/\\evil.com"],
    ["backslash later", "/recept\\..\\evil"],
    ["tab", "/\t/evil.com"],
    ["newline", "/\n/evil.com"],
    ["javascript URL", "javascript:alert(1)"],
    ["relative path", "recept"],
    ["empty", ""],
    ["whitespace prefix", " /recept"],
    ["too long", `/${"a".repeat(3000)}`],
    ["just over the cap", `/${"a".repeat(512)}`],
    ["tab after the slash", "/\t/evil"],
    ["newline after the slash", "/\n/evil"],
    ["encoded slashes", "%2F%2Fevil"],
    ["encoded slash after the slash", "/%2F/evil"],
    ["encoded slash, lower case", "/%2f/evil"],
    ["encoded backslash", "/%5Cevil"],
    ["encoded backslash later", "/recept/%5c..%5cevil"],
    ["encoded control character", "/%09/evil"],
    ["javascript scheme", "javascript:"],
    ["broken percent encoding", "/recept%E0%A4%A"],
  ])("falls back for %s", (_name, raw) => {
    expect(safeNextPath(raw)).toBe(defaultNextPath);
  });

  it("falls back for null and undefined", () => {
    expect(safeNextPath(null)).toBe("/recept");
    expect(safeNextPath(undefined)).toBe("/recept");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//evil.com", "/")).toBe("/");
  });
});

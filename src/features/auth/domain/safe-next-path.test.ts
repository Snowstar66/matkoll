import { describe, expect, it } from "vitest";
import { defaultNextPath, safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it.each([
    ["/recept", "/recept"],
    ["/recept/123?flik=steg", "/recept/123?flik=steg"],
    ["/", "/"],
    ["/recept#steg-2", "/recept#steg-2"],
    ["/a/../recept", "/recept"],
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

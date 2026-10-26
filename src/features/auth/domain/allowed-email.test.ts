import { describe, expect, it } from "vitest";
import { isAllowedEmail, normalizeEmail } from "./allowed-email";

const allowed = ["pontus@example.com", "other@example.com"];

describe("isAllowedEmail", () => {
  it("accepts an address in the list, ignoring case and surrounding space", () => {
    expect(isAllowedEmail("pontus@example.com", allowed)).toBe(true);
    expect(isAllowedEmail("  Pontus@Example.COM ", allowed)).toBe(true);
  });

  it("rejects an address outside the list", () => {
    expect(isAllowedEmail("stranger@example.com", allowed)).toBe(false);
    expect(isAllowedEmail("pontus@example.com.evil.com", allowed)).toBe(false);
  });

  it("rejects missing and empty addresses", () => {
    expect(isAllowedEmail(undefined, allowed)).toBe(false);
    expect(isAllowedEmail(null, allowed)).toBe(false);
    expect(isAllowedEmail("", allowed)).toBe(false);
    expect(isAllowedEmail("   ", [""])).toBe(false);
  });

  it("allows no one when the list is empty", () => {
    expect(isAllowedEmail("pontus@example.com", [])).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail(" A@B.se ")).toBe("a@b.se");
  });
});

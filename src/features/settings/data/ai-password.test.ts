import { describe, expect, it } from "vitest";
import { aiPasswordMatches } from "./ai-password";

describe("aiPasswordMatches", () => {
  it("accepts the default password when none is configured", () => {
    expect(aiPasswordMatches("frasse", undefined)).toBe(true);
  });

  it("refuses a wrong, empty or missing password", () => {
    expect(aiPasswordMatches("fel", undefined)).toBe(false);
    expect(aiPasswordMatches("Frasse", undefined)).toBe(false);
    expect(aiPasswordMatches("", undefined)).toBe(false);
    expect(aiPasswordMatches(undefined, undefined)).toBe(false);
    expect(aiPasswordMatches(42, undefined)).toBe(false);
  });

  it("uses the configured password instead of the default", () => {
    expect(aiPasswordMatches("hemligt", "hemligt")).toBe(true);
    expect(aiPasswordMatches("frasse", "hemligt")).toBe(false);
  });
});

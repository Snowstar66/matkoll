import { describe, expect, it } from "vitest";
import { aiPasswordConfigured, aiPasswordMatches } from "./ai-password";

describe("aiPasswordMatches", () => {
  it("accepts the configured password", () => {
    expect(aiPasswordMatches("hemligt", "hemligt")).toBe(true);
  });

  it("refuses a wrong, empty or missing password", () => {
    expect(aiPasswordMatches("fel", "hemligt")).toBe(false);
    expect(aiPasswordMatches("Hemligt", "hemligt")).toBe(false);
    expect(aiPasswordMatches("hemligt ", "hemligt")).toBe(false);
    expect(aiPasswordMatches("", "hemligt")).toBe(false);
    expect(aiPasswordMatches(undefined, "hemligt")).toBe(false);
    expect(aiPasswordMatches(42, "hemligt")).toBe(false);
  });

  it("refuses everything when AI_SETTINGS_PASSWORD is not set: there is no built-in default", () => {
    for (const given of ["frasse", "", "undefined", "hemligt", undefined, null, 42]) {
      expect(aiPasswordMatches(given, undefined), String(given)).toBe(false);
      expect(aiPasswordMatches(given, ""), String(given)).toBe(false);
    }
  });
});

describe("aiPasswordConfigured", () => {
  it("is true only for a non-empty value", () => {
    expect(aiPasswordConfigured("hemligt")).toBe(true);
    expect(aiPasswordConfigured("")).toBe(false);
    expect(aiPasswordConfigured(undefined)).toBe(false);
  });
});

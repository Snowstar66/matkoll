import { describe, expect, it } from "vitest";
import { containsPattern } from "./like-pattern";

describe("containsPattern", () => {
  it("finds the text anywhere", () => {
    expect(containsPattern("lök")).toBe("%lök%");
  });

  it("escapes LIKE wildcards and drops PostgREST's *", () => {
    expect(containsPattern("50%_a\\b")).toBe("%50\\%\\_a\\\\b%");
    expect(containsPattern("lö*k")).toBe("%lök%");
  });

  it("gives nothing for empty text", () => {
    expect(containsPattern("")).toBe("");
    expect(containsPattern("**")).toBe("");
  });
});

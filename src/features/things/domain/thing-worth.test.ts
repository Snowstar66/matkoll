import { describe, expect, it } from "vitest";
import { worthConfidenceText, worthMarkerLabel, worthOfRow } from "./thing-worth";

describe("worthOfRow", () => {
  it("makes a tip of a sentence and a known confidence, trimmed", () => {
    expect(worthOfRow({ worth_why: "  Liknar Arabia.  ", worth_confidence: "sure" })).toEqual({ why: "Liknar Arabia.", confidence: "sure" });
  });

  it("is no tip without a sentence, with an unknown confidence, or without the columns", () => {
    expect(worthOfRow({ worth_why: null, worth_confidence: null })).toBeNull();
    expect(worthOfRow({ worth_why: "   ", worth_confidence: "sure" })).toBeNull();
    expect(worthOfRow({ worth_why: "Liknar Arabia.", worth_confidence: "kanske" })).toBeNull();
    expect(worthOfRow({})).toBeNull();
  });
});

describe("the words", () => {
  it("says the confidence in Swedish and names the marker", () => {
    expect(worthConfidenceText("sure")).toBe("Säker");
    expect(worthConfidenceText("guess")).toBe("Gissning");
    expect(worthConfidenceText("unsure")).toBe("Osäker");
    expect(worthMarkerLabel({ why: "x", confidence: "unsure" })).toBe("Kan ha värde, osäker");
  });
});

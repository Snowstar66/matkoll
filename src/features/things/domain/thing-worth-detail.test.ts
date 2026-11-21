import { describe, expect, it } from "vitest";
import { formatWorthDetail, maxWorthDetailChars, parseWorthDetail, worthOfRow } from "./thing-worth";

// The kept explanation ("Förklara närmare"): written as three headings with the checks as lines, read back to the same
// parts, cut to the column's length, and carried on the föremål's tip as `detail`.

describe("the kept explanation", () => {
  const parts = { why: "Formen liknar äldre kristall.", couldBe: "Troligen svensk kristall, en gissning.", checks: ["Titta på botten.", "Jämför med kataloger."] };

  it("is written with three headings and the checks as lines, and read back to the same parts", () => {
    const text = formatWorthDetail(parts);
    expect(text).toBe(
      "Därför markerades den\nFormen liknar äldre kristall.\n\nVad det kan vara\nTroligen svensk kristall, en gissning.\n\nAtt undersöka vidare\n- Titta på botten.\n- Jämför med kataloger.",
    );
    expect(parseWorthDetail(text ?? "")).toEqual(parts);
  });

  it("is on the föremål's tip as `detail`, trimmed, and none when empty", () => {
    expect(worthOfRow({ worth_why: "Liknar Arabia.", worth_confidence: "sure", worth_detail: " Text " })).toEqual({ why: "Liknar Arabia.", confidence: "sure", detail: "Text" });
    expect(worthOfRow({ worth_why: "Liknar Arabia.", worth_confidence: "sure", worth_detail: "  " })).toEqual({ why: "Liknar Arabia.", confidence: "sure" });
    expect(worthOfRow({ worth_why: null, worth_confidence: null, worth_detail: "Text" })).toBeNull();
  });

  it("is cut to the column's length by dropping the last checks, and nothing to keep without any text", () => {
    const text = formatWorthDetail({ why: "w".repeat(700), couldBe: "c".repeat(700), checks: ["a".repeat(150), "b".repeat(150), "c".repeat(150), "d".repeat(150)] });
    expect(text === null || text.length <= maxWorthDetailChars).toBe(true);
    const fits = formatWorthDetail({ why: "w".repeat(380), couldBe: "c".repeat(380), checks: ["a".repeat(150), "b".repeat(150), "c".repeat(150), "d".repeat(150)] });
    expect(fits).not.toBeNull();
    expect((fits ?? "").length).toBeLessThanOrEqual(maxWorthDetailChars);
    expect(formatWorthDetail({ why: " ", couldBe: "", checks: [" "] })).toBeNull();
  });

  it("is not parsed when it is not in the written shape", () => {
    expect(parseWorthDetail("Bara en rad.")).toBeNull();
    expect(parseWorthDetail("Vad det kan vara\nx\n\nDärför markerades den\ny\n\nAtt undersöka vidare\n- z")).toBeNull();
  });
});

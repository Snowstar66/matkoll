import { describe, expect, it } from "vitest";
import { createMenuStreamParser, formatMenuStreamLine, menuReaderOf, menuReaderText, parseMenuStreamLine } from "./reading";

describe("the live reading's lines", () => {
  it("writes one JSON per line and reads it back", () => {
    const line = formatMenuStreamLine({ type: "language", sprak: "es" });
    expect(line).toBe('{"type":"language","sprak":"es"}\n');
    expect(parseMenuStreamLine(line)).toEqual({ type: "language", sprak: "es" });
  });

  it("skips empty, broken and unknown lines", () => {
    expect(parseMenuStreamLine("")).toBeNull();
    expect(parseMenuStreamLine("{oops")).toBeNull();
    expect(parseMenuStreamLine('{"type":"mystery"}')).toBeNull();
  });

  it("cuts chunks that end in the middle of a line, and gives the last line at the end", () => {
    const parser = createMenuStreamParser();
    const a = formatMenuStreamLine({ type: "error", code: "ai_invalid" });
    expect(parser.push(a.slice(0, 10))).toEqual([]);
    expect(parser.push(`${a.slice(10)}{"type":"language"`)).toEqual([{ type: "error", code: "ai_invalid" }]);
    expect(parser.push(',"sprak":"sv"}')).toEqual([]);
    expect(parser.end()).toEqual([{ type: "language", sprak: "sv" }]);
  });

  it("names who read", () => {
    expect(menuReaderText(menuReaderOf("standard"))).toBe("Läst av Haiku 5.5 · låg");
    expect(menuReaderText(menuReaderOf("careful"))).toBe("Läst av Sonnet 5.5 · medel");
  });
});

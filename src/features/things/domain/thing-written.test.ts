import { describe, expect, it } from "vitest";
import { boxMeta, maxWrittenThings, parseWrittenThings, writtenMeta, writtenToText } from "./thing-written";

const names = (text: string) => {
  const parsed = parseWrittenThings(text);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.names;
};

describe("parseWrittenThings", () => {
  it("takes one thing per line, with a capital", () => {
    expect(names("julgransbelysning\nskarvsladdar\n  glitter  ")).toEqual(["Julgransbelysning", "Skarvsladdar", "Glitter"]);
  });

  it("takes commas and semicolons too", () => {
    expect(names("hammare, tång; sax\nspik")).toEqual(["Hammare", "Tång", "Sax", "Spik"]);
  });

  it("keeps a quantity on its thing, in the text and back", () => {
    expect(names("adventsljusstake, 2 st\nskarvsladdar")).toEqual(["Adventsljusstake, 2 st", "Skarvsladdar"]);
    expect(names("adventsljusstake, 2")).toEqual(["Adventsljusstake, 2 st"]);
    expect(names("2 st tomtenissar")).toEqual(["2 st tomtenissar"]);
    // Saved names go back into the field and read the same.
    const saved = names("adventsljusstake, 2 st, glitter");
    expect(names(writtenToText(saved))).toEqual(saved);
  });

  it("drops list marks, empty lines and a thing written twice", () => {
    expect(names("- hammare\n\n• Hammare\n* tång")).toEqual(["Hammare", "Tång"]);
  });

  it("accepts an empty text, which empties the box", () => {
    expect(names("  \n ")).toEqual([]);
  });

  it("refuses a name that is too long, too many things and a text that is too long", () => {
    expect(parseWrittenThings("x".repeat(81))).toHaveProperty("error");
    expect(parseWrittenThings("x".repeat(80))).toEqual({ names: ["X".repeat(1) + "x".repeat(79)] });
    const many = Array.from({ length: maxWrittenThings + 1 }, (_, index) => `Sak ${index}`).join("\n");
    expect(parseWrittenThings(many)).toHaveProperty("error");
    expect(parseWrittenThings("a\n".repeat(4_001))).toHaveProperty("error");
  });
});

describe("what a box says", () => {
  it("writes the line of a written box and of the list of boxes", () => {
    expect(writtenMeta({ things: 6, writtenAt: new Date("2026-10-31T10:00:00Z") })).toBe("skrivet 31 okt · 6 föremål");
    expect(boxMeta({ cards: 0, written: 6 })).toBe("skrivet 6 föremål");
    expect(boxMeta({ cards: 2, written: 1 })).toBe("2 kort · skrivet 1 föremål");
    expect(boxMeta({ cards: 0, written: 0 })).toBe("Inget än");
  });
});

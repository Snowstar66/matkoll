import { describe, expect, it } from "vitest";
import { customLineKey, lineKeySchema, maxLineKeyChars, parseLineKey, recipeLineKey, textLineKey } from "./line-key";

const mjol = "1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b";
const custom = "6f1c1a52-6a4c-4f0e-9a37-0b5d2a3c4e11";

describe("line keys", () => {
  it("builds a recipe line's key from ingredient and unit, with - only for a vague line", () => {
    expect(recipeLineKey(mjol, "dl")).toBe(`r:${mjol}:dl`);
    expect(recipeLineKey(mjol, "st")).toBe(`r:${mjol}:st`);
    expect(recipeLineKey(mjol, null)).toBe(`r:${mjol}:-`);
  });

  it("builds a text line's key from the text in lower case, trimmed, with single spaces", () => {
    expect(textLineKey("  Färsk  KORIANDER ")).toBe("t:färsk koriander");
    expect(textLineKey("färsk koriander")).toBe(textLineKey("Färsk Koriander"));
  });

  it("builds a custom item's key from its id", () => {
    expect(customLineKey(custom)).toBe(`c:${custom}`);
  });

  it("parses every key it builds", () => {
    expect(parseLineKey(recipeLineKey(mjol, "dl"))).toEqual({ kind: "recipe", ingredientId: mjol, unit: "dl" });
    expect(parseLineKey(recipeLineKey(mjol, null))).toEqual({ kind: "vague", ingredientId: mjol });
    expect(parseLineKey(textLineKey("Färsk koriander"))).toEqual({ kind: "text", text: "färsk koriander" });
    expect(parseLineKey(customLineKey(custom))).toEqual({ kind: "custom", id: custom });
  });

  it("refuses keys it never builds", () => {
    for (const key of [
      "",
      "r:",
      `r:${mjol}`,
      `r:${mjol}:`,
      `r:${mjol}:näve`,
      "r:mjol:dl",
      "t:Stor Text",
      "t: med mellanslag",
      "c:abc",
      `x:${mjol}`,
      `t:${"a".repeat(301)}`,
    ]) {
      expect(parseLineKey(key), key).toBeNull();
    }
  });

  it("builds a text key that fits and that parseLineKey reads, for any text", () => {
    const texts = [
      "",
      "   ",
      "\t En  näve \n persilja ",
      "İSTANBUL-KRYDDA",
      "ǅ Ǆ ß ẞ Σ ΟΔΟΣ",
      "e\u0301 och é",
      "a".repeat(400),
      `${"b".repeat(299)} İ`,
      `${"c".repeat(299)}  d`,
      `${"x".repeat(299)}😀😀`,
      "😀".repeat(200),
      `${"ö".repeat(150)}${"İ".repeat(200)}`,
    ];
    // Deterministic pseudo-random texts from a mix of awkward characters.
    const alphabet = ["a", "Å", "İ", "ı", " ", "\u00a0", "\t", "😀", "e\u0301", "ß", "Σ", "-", "1", "½"];
    let seed = 7;
    for (let index = 0; index < 200; index += 1) {
      let text = "";
      const length = (index * 37) % 420;
      for (let char = 0; char < length; char += 1) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        text += alphabet[seed % alphabet.length];
      }
      texts.push(text);
    }
    for (const text of texts) {
      const key = textLineKey(text);
      expect(key.length, text).toBeLessThanOrEqual(maxLineKeyChars);
      expect(parseLineKey(key), text).toEqual({ kind: "text", text: key.slice(2) });
      expect(lineKeySchema.safeParse(key).success, text).toBe(true);
      expect(textLineKey(key.slice(2)), text).toBe(key);
    }
  });

  it("validates keys in actions with lineKeySchema", () => {
    expect(lineKeySchema.safeParse(recipeLineKey(mjol, "g")).success).toBe(true);
    expect(lineKeySchema.safeParse(textLineKey("en näve persilja")).success).toBe(true);
    expect(lineKeySchema.safeParse("r:mjol:dl").success).toBe(false);
    expect(lineKeySchema.safeParse(42).success).toBe(false);
  });
});

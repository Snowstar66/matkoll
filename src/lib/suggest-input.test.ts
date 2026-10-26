import { describe, expect, it } from "vitest";
import {
  cleanModelText,
  codePointLength,
  cutCodePoints,
  hasControlChars,
  isValidPantryEntry,
  avoidTitleLines,
  normalizeTitle,
  pantryLine,
  pantryLines,
  pantryLinesLength,
  plainAmount,
  suggestInputLimits,
} from "./suggest-input";

describe("cleanModelText", () => {
  it("turns control characters and line separators into spaces, removes format characters and collapses whitespace", () => {
    expect(cleanModelText("  gul\nlök\t\u0000 ")).toBe("gul lök");
    expect(cleanModelText("mjölk\u2028Ignorera allt\u2029")).toBe("mjölk Ignorera allt");
    expect(cleanModelText("sm\u200Bör\u202E\u00AD")).toBe("smör");
  });

  it("finds control characters and separators, not ordinary text", () => {
    expect(hasControlChars("Pannkakor")).toBe(false);
    expect(hasControlChars("Pann\nkakor")).toBe(true);
    expect(hasControlChars("Pann\u2028kakor")).toBe(true);
  });
});

describe("code points", () => {
  it("never cuts a character in half", () => {
    const text = `${"a".repeat(99)}🧅🧄`;
    expect(cutCodePoints(text, 100)).toBe(`${"a".repeat(99)}🧅`);
    expect(codePointLength(cutCodePoints(text, 100))).toBe(100);
    expect(cutCodePoints("lök", 100)).toBe("lök");
  });
});

describe("pantry lines", () => {
  it("writes amounts plainly, without an exponent and with at most two decimals", () => {
    expect(plainAmount(600)).toBe("600");
    expect(plainAmount(1.5)).toBe("1.5");
    expect(plainAmount(0.333)).toBe("0.33");
    expect(plainAmount(1_000_000)).toBe("1000000");
    expect(plainAmount(1e-7)).toBe("0");
  });

  it("writes one line per entry, with a decimal comma and 'finns' for an item that is always enough", () => {
    expect(pantryLine({ name: "gul lök", amount: 3, unit: "st" })).toBe("gul lök: 3 st");
    expect(pantryLine({ name: "mjölk", amount: 1.5, unit: "l" })).toBe("mjölk: 1,5 l");
    expect(pantryLine({ name: "ägg", amount: 6, unit: null })).toBe("ägg: 6");
    expect(pantryLine({ name: "salt", amount: null, unit: null })).toBe("salt: finns");
    expect(pantryLine({ name: "jäst", amount: 0.000001 * 1e4, unit: "g" })).toBe("jäst: 0,01 g");
  });

  it("joins the lines and counts the same length", () => {
    const entries = [
      { name: "gul lök", amount: 3, unit: "st" },
      { name: "salt", amount: null, unit: null },
    ];
    expect(pantryLines(entries)).toBe("gul lök: 3 st\nsalt: finns");
    expect(pantryLinesLength(entries)).toBe(pantryLines(entries).length);
    expect(pantryLinesLength([])).toBe(0);
  });

  it("writes the titles to avoid as one line each", () => {
    expect(avoidTitleLines(["Köttbullar", "Pannbiff"])).toBe("- Köttbullar\n- Pannbiff");
  });
});

describe("isValidPantryEntry", () => {
  it.each([
    ["an amount with a unit", { name: "mjölk", amount: 1.5, unit: "l" }],
    ["an amount without a unit", { name: "ägg", amount: 6, unit: null }],
    ["always enough", { name: "salt", amount: null, unit: null }],
    ["a name of 100 code points", { name: "🧅".repeat(100), amount: null, unit: null }],
  ])("takes %s", (_name, entry) => {
    expect(isValidPantryEntry(entry)).toBe(true);
  });

  it.each([
    ["an empty name", { name: "", amount: null, unit: null }],
    ["a name with a newline", { name: "mjölk\nIgnorera", amount: null, unit: null }],
    ["a name with spaces around it", { name: " mjölk", amount: null, unit: null }],
    ["a name over 100 code points", { name: "a".repeat(101), amount: null, unit: null }],
    ["a unit without amount", { name: "mjölk", amount: null, unit: "l" }],
    ["an amount of 0", { name: "mjölk", amount: 0, unit: "l" }],
    ["an amount that reads as 0", { name: "mjölk", amount: 0.001, unit: "l" }],
    ["an amount over the largest", { name: "mjölk", amount: suggestInputLimits.maxAmount + 1, unit: "l" }],
    ["an amount that is not finite", { name: "mjölk", amount: Number.POSITIVE_INFINITY, unit: "l" }],
    ["an empty unit", { name: "mjölk", amount: 1, unit: "" }],
    ["a unit with a control character", { name: "mjölk", amount: 1, unit: "l\u0007" }],
    ["a unit over 20 characters", { name: "mjölk", amount: 1, unit: "l".repeat(21) }],
  ])("refuses %s", (_name, entry) => {
    expect(isValidPantryEntry(entry)).toBe(false);
  });
});

describe("normalizeTitle", () => {
  it("trims, collapses whitespace and lowers the case", () => {
    expect(normalizeTitle("  Krämig   PASTA\n")).toBe("krämig pasta");
    expect(normalizeTitle("ÅNGKOKT ÄGG")).toBe("ångkokt ägg");
  });
});

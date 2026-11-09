import { describe, expect, it } from "vitest";
import {
  COUNT_UNITS,
  displayAmount,
  formatQuantity,
  importAmount,
  isCountUnit,
  normalizeUnit,
  parseQuantity,
  UNITS,
  unitInNoun,
  unitOfNoun,
  unitSchema,
} from "./units";

describe("UNITS", () => {
  it("is the fixed list from AD-12", () => {
    expect(UNITS).toEqual(["g", "kg", "ml", "cl", "dl", "l", "krm", "tsk", "msk", "st", "förp", "klyfta", "kruka", "knippe", "skiva"]);
    expect(unitSchema.safeParse("dl").success).toBe(true);
    expect(unitSchema.safeParse("deciliter").success).toBe(false);
  });
});

describe("normalizeUnit", () => {
  it.each([
    ["deciliter", "dl"],
    ["DL", "dl"],
    ["msk.", "msk"],
    ["paket", "förp"],
    ["förpackning", "förp"],
    [" Gram ", "g"],
    ["tesked", "tsk"],
    ["matskedar", "msk"],
    ["stycken", "st"],
    ["klyftor", "klyfta"],
    ["skivor", "skiva"],
    ["knippen", "knippe"],
  ])("%s → %s", (raw, unit) => {
    expect(normalizeUnit(raw)).toEqual({ unit, known: true });
  });

  it.each(UNITS)("knows its own unit %s", (unit) => {
    expect(normalizeUnit(unit)).toEqual({ unit, known: true });
  });

  it("composes decomposed letters", () => {
    expect(normalizeUnit("pa\u030ase")).toEqual({ unit: "förp", known: true });
    expect(normalizeUnit("fo\u0308rp")).toEqual({ unit: "förp", known: true });
  });

  it.each(["näve", "skvätt", "nypa", "constructor", "__proto__", "toString", "hasOwnProperty"])("does not know %s", (raw) => {
    expect(normalizeUnit(raw)).toEqual({ unit: null, known: false });
  });

  it("treats a missing unit as no unit, not an unknown one", () => {
    expect(normalizeUnit(null)).toEqual({ unit: null, known: true });
    expect(normalizeUnit(undefined)).toEqual({ unit: null, known: true });
    expect(normalizeUnit("  ")).toEqual({ unit: null, known: true });
  });
});

describe("importAmount", () => {
  it.each([
    [2, "dl", 2, "dl"],
    [2, "paket", 2, "förp"],
    [2, null, 2, null],
    [2, "", 2, null],
    [1, "nypa", 1, "krm"],
    [2, "nypor", 2, "krm"],
    [1, "näve", 1, "dl"],
    [1, "Kvist", 1, "st"],
    [3, "kvistar", 3, "st"],
    [1, "bit", 1, "st"],
    [2, "bitar", 2, "st"],
    [1, "glas", 2, "dl"],
    [1, "bunt", 1, "knippe"],
    [1, "huvud", 1, "st"],
    [2, "tbsp", 2, "msk"],
    [2, "Tablespoons", 2, "msk"],
    [1, "tsp", 1, "tsk"],
    [0.5, "teaspoon", 0.5, "tsk"],
    [1, "cup", 2.5, "dl"],
    [2, "cups", 5, "dl"],
    [0.25, "cup", 0.6, "dl"],
    [1.75, "cups", 4, "dl"],
    [8, "oz", 225, "g"],
    [12, "oz.", 335, "g"],
    [3, "oz", 85, "g"],
    [1, "oz", 28, "g"],
    [1, "lb", 455, "g"],
    [2, "lbs", 910, "g"],
    [2, "fl oz", 6, "cl"],
    [1, "pinch", 1, "krm"],
    [1, "can", 1, "förp"],
    [3, "cloves", 3, "klyfta"],
    [2, "bunches", 2, "knippe"],
    [1, "stick", 115, "g"],
    [2, "sticks", 225, "g"],
    [1, "handful", 1, "dl"],
  ])("%s %s → %s %s", (amount, raw, expectedAmount, unit) => {
    expect(importAmount(amount, raw)).toEqual({ amount: expectedAmount, unit });
  });

  it.each(["sked", "skvätt", "constructor", "__proto__"])("gives null for %s, so the line keeps only its text", (raw) => {
    expect(importAmount(1, raw)).toBeNull();
  });
});

describe("parseQuantity", () => {
  it.each([
    ["1,5", 1.5],
    ["1.5", 1.5],
    ["½", 0.5],
    ["1 1/2", 1.5],
    ["1½", 1.5],
    ["1 ½", 1.5],
    ["3/4", 0.75],
    ["2-3", 3],
    ["2–3", 3],
    ["2 - 3", 3],
    ["½-1", 1],
    [" 4 ", 4],
    ["250", 250],
    ["1.500", 1500],
    ["1 000", 1000],
    ["10 000", 10000],
    ["1\u00a0000", 1000],
    ["1 000,5", 1000.5],
    ["1 000-2 000", 2000],
    ["1.50", 1.5],
    ["1.5000", 1.5],
  ])("%s → %s", (text, amount) => {
    expect(parseQuantity(text)).toBe(amount);
  });

  it.each(["", "  ", "lite", "1,5 dl", "0", "1/0", "2-3-4", "1,2,3", "-2", "1 00", "1.500.5", null, undefined])(
    "gives null for %s",
    (text) => {
      expect(parseQuantity(text)).toBeNull();
    },
  );
});

describe("unitInNoun", () => {
  it.each([
    ["2 vitlöksklyftor", "klyfta"],
    ["1 vitlöksklyfta", "klyfta"],
    ["3 klyftor vitlök, pressade", "klyfta"],
    ["2 stora vitlöksklyftor", "klyfta"],
    ["2-3 vitlöksklyftor (pressade)", "klyfta"],
    ["ca 4 Vitlöksklyftor", "klyfta"],
    ["en vitlöksklyfta, riven", "klyfta"],
    ["1 dillknippe", "knippe"],
    ["1 basilikakruka", "kruka"],
    ["4 skinkskivor", "skiva"],
  ] as const)("%s → %s", (text, unit) => {
    expect(unitInNoun(text)).toBe(unit);
  });

  it.each([
    "1 vitlök",
    "1/2 vitlök",
    "½ vitlök, delad i klyftor",
    "1 citron i klyftor",
    "1 citron, i klyftor",
    "2 tomater, skivade",
    "vitlöksklyftor efter smak",
    "2 dillkvistar",
    "",
  ])("%s has no unit in its noun", (text) => {
    expect(unitInNoun(text)).toBeNull();
  });

  it("reads the unit from a noun's ending", () => {
    expect(unitOfNoun("Vitlöksklyfta")).toBe("klyfta");
    expect(unitOfNoun("vitlök")).toBeNull();
    expect(unitOfNoun(null)).toBeNull();
  });
});

describe("isCountUnit", () => {
  it("is true for the units that count whole things only", () => {
    expect(UNITS.filter(isCountUnit)).toEqual([...COUNT_UNITS]);
    expect(isCountUnit(null)).toBe(false);
    expect(isCountUnit("dl")).toBe(false);
  });
});

describe("displayAmount", () => {
  it("rounds to two decimals, half up, as formatQuantity shows it", () => {
    expect(displayAmount(10 / 3)).toBe(3.33);
    expect(displayAmount(1.005)).toBe(1.01);
    expect(displayAmount(2)).toBe(2);
  });
});

describe("formatQuantity", () => {
  it.each([
    [1.5, "dl", "1,5 dl"],
    [2, "st", "2 st"],
    [0.333, "dl", "0,33 dl"],
    [0.005, "g", "0,01 g"],
    [0.004, "g", "<0,01 g"],
    [0.0001, null, "<0,01"],
    [1.005, "dl", "1,01 dl"],
    [2.675, "dl", "2,68 dl"],
    [0.125, "kg", "0,13 kg"],
    [1500, "g", "1500 g"],
    [0, "g", "0 g"],
    [2, null, "2"],
    [null, null, ""],
    [null, "dl", ""],
  ] as const)("(%s, %s) → %j", (amount, unit, text) => {
    expect(formatQuantity(amount, unit)).toBe(text);
  });
});

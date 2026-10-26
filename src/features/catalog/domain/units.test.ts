import { describe, expect, it } from "vitest";
import { COUNT_UNITS, displayAmount, formatQuantity, isCountUnit, normalizeUnit, parseQuantity, UNITS, unitSchema } from "./units";

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

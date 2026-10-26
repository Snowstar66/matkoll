import { describe, expect, it } from "vitest";
import { atHomeText, coverage, isShort } from "./coverage";
import { toSnapshot } from "./pantry-item";

const snapshot = toSnapshot([
  { ingredientId: "gradde", amount: 2, unit: "dl" },
  { ingredientId: "mjol", amount: 1, unit: "kg" },
  { ingredientId: "mjol", amount: 500, unit: "g" },
  { ingredientId: "salt", amount: null, unit: null },
  // Unlimited in one location, an amount in another: still unlimited.
  { ingredientId: "socker", amount: null, unit: null },
  { ingredientId: "socker", amount: 1, unit: "dl" },
  { ingredientId: "mjolk", amount: 0.1, unit: "l" },
  { ingredientId: "mjolk", amount: 0.2, unit: "l" },
]);

describe("coverage", () => {
  it("is covered when the same unit has enough, also exactly enough", () => {
    expect(coverage({ ingredientId: "gradde", amount: 1, unit: "dl" }, snapshot)).toEqual({ kind: "covered" });
    expect(coverage({ ingredientId: "gradde", amount: 2, unit: "dl" }, snapshot)).toEqual({ kind: "covered" });
    // The snapshot's 0.1 + 0.2 is 0.3, so a need of 0.3 l is covered.
    expect(coverage({ ingredientId: "mjolk", amount: 0.3, unit: "l" }, snapshot)).toEqual({ kind: "covered" });
  });

  it("is partial with what is short when the same unit has too little", () => {
    expect(coverage({ ingredientId: "gradde", amount: 3, unit: "dl" }, snapshot)).toEqual({
      kind: "partial",
      remaining: 1,
      amounts: [{ unit: "dl", amount: 2 }],
    });
    expect(coverage({ ingredientId: "mjolk", amount: 0.4, unit: "l" }, snapshot)).toEqual({
      kind: "partial",
      remaining: 0.1,
      amounts: [{ unit: "l", amount: 0.3 }],
    });
  });

  it("gives the pantry's amounts when the ingredient is at home only in other units", () => {
    expect(coverage({ ingredientId: "mjol", amount: 2, unit: "dl" }, snapshot)).toEqual({
      kind: "other-unit",
      amounts: [
        { unit: "g", amount: 500 },
        { unit: "kg", amount: 1 },
      ],
    });
  });

  it("compares only the need's unit when the pantry has it among others, and gives every unit at home", () => {
    expect(coverage({ ingredientId: "mjol", amount: 600, unit: "g" }, snapshot)).toEqual({
      kind: "partial",
      remaining: 100,
      amounts: [
        { unit: "g", amount: 500 },
        { unit: "kg", amount: 1 },
      ],
    });
  });

  it("is missing when the ingredient is not at home", () => {
    expect(coverage({ ingredientId: "agg", amount: 3, unit: "st" }, snapshot)).toEqual({ kind: "missing" });
  });

  it("is always covered by an unlimited item, whatever the amount and unit", () => {
    expect(coverage({ ingredientId: "salt", amount: 1000, unit: "kg" }, snapshot)).toEqual({ kind: "covered" });
    expect(coverage({ ingredientId: "socker", amount: 5, unit: "dl" }, snapshot)).toEqual({ kind: "covered" });
  });

  it("covers a vague need with the ingredient in any form, and otherwise is vague-missing", () => {
    expect(coverage({ ingredientId: "salt", amount: null, unit: null }, snapshot)).toEqual({ kind: "covered" });
    expect(coverage({ ingredientId: "mjol", amount: null, unit: null }, snapshot)).toEqual({ kind: "covered" });
    expect(coverage({ ingredientId: "peppar", amount: null, unit: null }, snapshot)).toEqual({ kind: "vague-missing" });
  });

  it("compares amounts as they are shown, so a short line never reads the same as what is at home", () => {
    const thirds = toSnapshot([{ ingredientId: "gradde", amount: 3.33, unit: "dl" }]);
    // 1 dl for 3 portions, scaled to 10: 3,333… dl reads 3,33 dl.
    expect(coverage({ ingredientId: "gradde", amount: 10 / 3, unit: "dl" }, thirds)).toEqual({ kind: "covered" });
    expect(coverage({ ingredientId: "gradde", amount: 3.335, unit: "dl" }, thirds)).toEqual({
      kind: "partial",
      remaining: 0.005,
      amounts: [{ unit: "dl", amount: 3.33 }],
    });
  });

  it("treats an empty pantry as missing", () => {
    expect(coverage({ ingredientId: "gradde", amount: 1, unit: "dl" }, new Map())).toEqual({ kind: "missing" });
  });
});

describe("isShort", () => {
  it("counts missing, partial and other-unit, never covered or vague-missing", () => {
    expect(isShort({ kind: "missing" })).toBe(true);
    expect(isShort({ kind: "partial", remaining: 1, amounts: [] })).toBe(true);
    expect(isShort({ kind: "other-unit", amounts: [] })).toBe(true);
    expect(isShort({ kind: "covered" })).toBe(false);
    expect(isShort({ kind: "vague-missing" })).toBe(false);
  });
});

describe("atHomeText", () => {
  it("lists the pantry's amounts with formatQuantity", () => {
    expect(atHomeText([{ unit: "kg", amount: 1 }])).toBe("hemma: 1 kg");
    expect(atHomeText([{ unit: "g", amount: 500 }, { unit: "kg", amount: 1.5 }])).toBe("hemma: 500 g, 1,5 kg");
  });
});

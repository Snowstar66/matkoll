import { describe, expect, it } from "vitest";
import { scaleFactor, scaleLines } from "./scale";

describe("scaleFactor", () => {
  it("is the chosen servings over the recipe's own", () => {
    expect(scaleFactor(6, 4)).toBe(1.5);
    expect(scaleFactor(2, 4)).toBe(0.5);
    expect(scaleFactor(4, 4)).toBe(1);
  });

  it("is 1 when either servings is not a positive number", () => {
    expect(scaleFactor(0, 4)).toBe(1);
    expect(scaleFactor(4, 0)).toBe(1);
    expect(scaleFactor(Number.NaN, 4)).toBe(1);
    expect(scaleFactor(4, Number.POSITIVE_INFINITY)).toBe(1);
    expect(scaleFactor(-2, 4)).toBe(1);
  });
});

describe("scaleLines", () => {
  it("multiplies each amount and keeps the other fields and the order", () => {
    const lines = [
      { id: "a", amount: 2, unit: "dl", isVague: false },
      { id: "b", amount: 100, unit: "g", isVague: false },
    ];
    expect(scaleLines(lines, 1.5)).toEqual([
      { id: "a", amount: 3, unit: "dl", isVague: false },
      { id: "b", amount: 150, unit: "g", isVague: false },
    ]);
  });

  it("leaves vague lines and lines without an amount unchanged", () => {
    const vague = { id: "salt", amount: null, unit: null, isVague: true };
    const vagueWithAmount = { id: "peppar", amount: 1, unit: "krm", isVague: true };
    expect(scaleLines([vague, vagueWithAmount], 3)).toEqual([vague, vagueWithAmount]);
  });

  it("does not change the input", () => {
    const lines = [{ amount: 2, isVague: false }];
    scaleLines(lines, 2);
    expect(lines).toEqual([{ amount: 2, isVague: false }]);
  });
});

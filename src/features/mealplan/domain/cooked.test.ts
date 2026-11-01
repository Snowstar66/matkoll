import { describe, expect, it } from "vitest";
import { toSnapshot } from "@/features/pantry";
import { cookedPlan, deductionText, newAmountOf, parseNewAmount, type CookedLine } from "./cooked";

// What a cooked dish takes from the pantry (Story 13.4): the same match as "X av Y hemma".

const line = (
  id: string,
  ingredientId: string | null,
  amount: number | null,
  unit: CookedLine["unit"],
  extra: Partial<CookedLine> = {},
): CookedLine => ({
  id,
  ingredientId,
  amount,
  unit,
  isVague: amount === null,
  originalText: `rad ${id}`,
  ...extra,
});

const names = { cream: "Grädde", flour: "Mjöl", salt: "Salt", milk: "Mjölk" };

describe("cookedPlan", () => {
  it("scales the need and suggests the new amount", () => {
    const snapshot = toSnapshot([{ ingredientId: "cream", amount: 5, unit: "dl" }]);
    const { deduct, check } = cookedPlan([line("1", "cream", 1, "dl")], 2, snapshot, names);
    expect(check).toEqual([]);
    expect(deduct).toEqual([
      { key: "cream:dl", ingredientId: "cream", name: "Grädde", unit: "dl", current: 5, need: 2, suggested: 3, short: false },
    ]);
    expect(deductionText(deduct[0]!, 2)).toBe("Receptet använder 2 dl");
  });

  it("sums lines of one ingredient and unit, and goes to 0 rather than below", () => {
    const snapshot = toSnapshot([{ ingredientId: "cream", amount: 2, unit: "dl" }]);
    const { deduct } = cookedPlan([line("1", "cream", 2, "dl"), line("2", "cream", 1, "dl")], 1, snapshot, names);
    expect(deduct).toMatchObject([{ need: 3, suggested: 0, short: true }]);
  });

  it("never converts units, and never guesses: other unit, missing, vague, unlimited, no ingredient", () => {
    const snapshot = toSnapshot([
      { ingredientId: "flour", amount: 1, unit: "kg" },
      { ingredientId: "milk", amount: null, unit: null },
    ]);
    const { deduct, check } = cookedPlan(
      [
        line("1", "flour", 2, "dl"),
        line("2", "cream", 1, "dl"),
        line("3", "salt", null, null),
        line("4", "milk", 1, "l"),
        line("5", null, 1, "dl", { originalText: "1 dl av något" }),
      ],
      1,
      snapshot,
      names,
    );
    expect(deduct).toEqual([]);
    expect(check.map((item) => item.text).sort()).toEqual(["1 dl av något", "Grädde", "Mjölk", "Mjöl", "Salt"].sort());
    expect(check.find((item) => item.text === "Mjöl")?.reason).toContain("Annan enhet");
  });
});

describe("parseNewAmount and newAmountOf", () => {
  it("reads a decimal comma, allows 0, and refuses more than is at home or nonsense", () => {
    expect(parseNewAmount("2,5", 5)).toBe(2.5);
    expect(parseNewAmount("0", 5)).toBe(0);
    expect(parseNewAmount("6", 5)).toBeNull();
    expect(parseNewAmount("", 5)).toBeNull();
    expect(parseNewAmount("abc", 5)).toBeNull();
  });

  it("keeps the exact suggestion while the text is the one shown", () => {
    const suggested = 1 / 3;
    expect(newAmountOf({ current: 2, suggested }, "0,33")).toBe(suggested);
    expect(newAmountOf({ current: 2, suggested }, "1")).toBe(1);
  });
});

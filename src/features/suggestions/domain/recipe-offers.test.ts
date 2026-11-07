import { describe, expect, it } from "vitest";
import type { Unit } from "@/features/catalog";
import type { StapleRules } from "@/features/pantry";
import { isMainLine, offerTagsByRecipe } from "./recipe-offers";

const offers = [
  { label: "Falukorv", name: "Falukorv", ingredientId: "falu", price: "2 för 50 kr" },
  { label: "Bondens Gul lök", name: "gul lök", ingredientId: "onion", price: "10 kr/kg" },
  { label: "Kummin", name: "Kummin", ingredientId: "cumin" },
  { label: "Herrgård, Präst", name: "Herrgård präst", ingredientId: null },
];
const staples: StapleRules = { byIngredient: { salt: { maxAmount: null, maxUnit: null } }, byName: {} };
const line = (ingredientId: string | null, amount: number | null = null, unit: Unit | null = null) => ({ ingredientId, amount, unit });

describe("isMainLine", () => {
  it("needs a catalog ingredient, so a vague line is never main", () => {
    expect(isMainLine(line(null))).toBe(false);
    expect(isMainLine(line("falu", 400, "g"))).toBe(true);
  });

  it("leaves out pinches and teaspoons, and the household's Basvaror", () => {
    expect(isMainLine(line("cumin", 1, "krm"))).toBe(false);
    expect(isMainLine(line("cumin", 2, "tsk"))).toBe(false);
    expect(isMainLine(line("salt", 1, "g"), staples)).toBe(false);
    expect(isMainLine(line("salt", 1, "g"))).toBe(true);
  });
});

describe("offerTagsByRecipe", () => {
  it("gives the offers a recipe uses on a main ingredient, in the sheet's order", () => {
    const tags = offerTagsByRecipe(offers, [{ id: "a", lines: [line("onion", 2, "st"), line("falu", 400, "g")] }]);
    // The short name without brand, and the price as the store wrote it (UX-20).
    expect(tags).toEqual({
      a: [
        { name: "Falukorv", price: "2 för 50 kr" },
        { name: "Gul lök", price: "10 kr/kg" },
      ],
    });
  });

  it("leaves out a recipe where only a spice or a vague line is on offer", () => {
    const tags = offerTagsByRecipe(offers, [
      { id: "spice", lines: [line("cumin", 1, "tsk"), line("rice", 4, "g")] },
      { id: "vague", lines: [line(null), line("rice", 4, "g")] },
    ]);
    expect(tags).toEqual({});
  });

  it("does not count an offer without a catalog ingredient, even when its name is a line's", () => {
    expect(offerTagsByRecipe(offers, [{ id: "a", lines: [line(null)] }])).toEqual({});
  });

  it("has nothing without offers", () => {
    expect(offerTagsByRecipe([], [{ id: "a", lines: [line("falu", 400, "g")] }])).toEqual({});
  });
});

import { describe, expect, it } from "vitest";
import {
  ingredientLabel,
  needsCheck,
  parseAmountInput,
  parseMinutesInput,
  withAmount,
  withChosenIngredient,
  withNewIngredient,
  withUnit,
} from "./preview";
import type { RecipeLine } from "./recipe-draft";

const id = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const other = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02";

const line: RecipeLine = {
  originalText: "2 gula lökar",
  amount: 2,
  unit: null,
  isVague: false,
  ingredient: { kind: "match", ingredientId: id, confidence: "hint" },
  stepIndexes: [0],
};
const vague: RecipeLine = { ...line, originalText: "1 bit ingefära", amount: null, isVague: true };

describe("parseAmountInput", () => {
  it("reads amounts with the catalog's parseQuantity", () => {
    expect(parseAmountInput("1,5")).toBe(1.5);
    expect(parseAmountInput("½")).toBe(0.5);
  });

  it("gives null for an empty field and undefined for text that is not a number", () => {
    expect(parseAmountInput("  ")).toBeNull();
    expect(parseAmountInput("abc")).toBeUndefined();
    expect(parseAmountInput("0")).toBeUndefined();
  });
});

describe("parseMinutesInput", () => {
  it("reads whole minutes", () => {
    expect(parseMinutesInput(" 45 ")).toBe(45);
    expect(parseMinutesInput("0")).toBe(0);
    expect(parseMinutesInput("")).toBeNull();
    expect(parseMinutesInput("1,5")).toBeUndefined();
    expect(parseMinutesInput("-5")).toBeUndefined();
    expect(parseMinutesInput("tio")).toBeUndefined();
  });
});

describe("editing a line", () => {
  it("sets the amount, and an amount makes a vague line exact", () => {
    expect(withAmount(line, 3)).toMatchObject({ amount: 3, isVague: false });
    expect(withAmount(vague, 1)).toMatchObject({ amount: 1, isVague: false });
    expect(withAmount({ ...line, unit: "st" }, null)).toMatchObject({ amount: null, unit: null, isVague: true });
    // Typed and cleared again: vague as before.
    expect(withAmount(withAmount(vague, 1), null)).toMatchObject({ amount: null, unit: null, isVague: true });
  });

  it("sets the unit, except on a vague line", () => {
    expect(withUnit(line, "st").unit).toBe("st");
    expect(withUnit(vague, "st")).toBe(vague);
  });

  it("records a chosen ingredient", () => {
    expect(withChosenIngredient(line, other).ingredient).toEqual({ kind: "chosen", ingredientId: other });
  });

  it("renames a new ingredient and keeps its section, location and unit", () => {
    const proposed: RecipeLine = {
      ...line,
      ingredient: { kind: "new", proposal: { name: "Lök", section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" } },
    };
    expect(withNewIngredient(proposed, " Gul lök ").ingredient).toEqual({
      kind: "new",
      proposal: { name: "Gul lök", section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" },
    });
  });

  it("gives a matched line a new ingredient with the AI's section, location and unit", () => {
    const hinted: RecipeLine = { ...line, hint: { name: "gul lök", section: "frukt & grönt", location: "skafferiet", defaultUnit: "styck" } };
    expect(withNewIngredient(hinted, "Schalottenlök").ingredient).toEqual({
      kind: "new",
      proposal: { name: "Schalottenlök", section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" },
    });
  });

  it("gives a matched line without hint a new ingredient in Övrigt", () => {
    expect(withNewIngredient(line, "Schalottenlök").ingredient).toEqual({
      kind: "new",
      proposal: { name: "Schalottenlök", section: "Övrigt", location: "Skafferi", defaultUnit: null },
    });
  });
});

describe("needsCheck", () => {
  it("is true only for a match through the AI's name", () => {
    expect(needsCheck(line)).toBe(true);
    expect(needsCheck({ ...line, ingredient: { kind: "match", ingredientId: id, confidence: "exact" } })).toBe(false);
    expect(needsCheck(withChosenIngredient(line, id))).toBe(false);
  });
});

describe("ingredientLabel", () => {
  const names = { [id]: "Gul lök" };

  it("names matched and chosen ingredients from the names", () => {
    expect(ingredientLabel(line, names)).toBe("Gul lök");
    expect(ingredientLabel(withChosenIngredient(line, id), names)).toBe("Gul lök");
  });

  it("falls back to the cleaned text when a name is missing", () => {
    expect(ingredientLabel(line, {})).toBe("gula lökar");
  });

  it("names a new ingredient by its proposal", () => {
    expect(ingredientLabel(withNewIngredient(line, "Schalottenlök"), names)).toBe("Schalottenlök");
  });

  it("says when there is no ingredient", () => {
    expect(ingredientLabel({ ...line, ingredient: { kind: "unmatched" } }, names)).toBe("Ingen ingrediens");
  });
});

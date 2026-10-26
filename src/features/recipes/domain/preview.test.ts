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
  withNewStep,
  withStepText,
  withoutLine,
  withoutPendingAmount,
  withoutStep,
  hasPending,
  isDraftDirty,
  isShownField,
} from "./preview";
import type { RecipeDraft, RecipeLine } from "./recipe-draft";

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

describe("adding and removing lines and steps", () => {
  const stepId = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a03";
  const draft: RecipeDraft = {
    title: "Linssoppa",
    servings: 4,
    totalMinutes: null,
    imageUrl: null,
    sourceKind: "text",
    sourceUrl: null,
    steps: [{ id: stepId, text: "Hacka." }, "Koka.", "Servera."],
    lines: [
      { ...line, stepIndexes: [0, 2] },
      { ...vague, stepIndexes: [1] },
      { ...line, originalText: "salt", stepIndexes: [2, 1] },
    ],
  };

  it("removes a line and leaves the others as they were", () => {
    expect(withoutLine(draft, 1).lines).toEqual([draft.lines[0], draft.lines[2]]);
    expect(withoutLine(draft, 1).steps).toBe(draft.steps);
  });

  it("moves typed amounts of later lines up when a line is removed", () => {
    expect(withoutPendingAmount({ totalMinutes: "x", amounts: { 0: "a", 1: "b", 3: "d" } }, 1)).toEqual({
      totalMinutes: "x",
      amounts: { 0: "a", 2: "d" },
    });
    const none = { totalMinutes: "x" };
    expect(withoutPendingAmount(none, 0)).toBe(none);
  });

  it("removes a step, and the lines keep pointing at the steps they had", () => {
    const changed = withoutStep(draft, 1);
    expect(changed.steps).toEqual([{ id: stepId, text: "Hacka." }, "Servera."]);
    expect(changed.lines.map(({ stepIndexes }) => stepIndexes)).toEqual([[0, 1], [], [1]]);
  });

  it("adds an empty step at the end", () => {
    expect(withNewStep(draft).steps).toEqual([...draft.steps, ""]);
  });

  it("changes a step's text and keeps a saved step's id", () => {
    expect(withStepText({ id: stepId, text: "Hacka." }, "Skiva.")).toEqual({ id: stepId, text: "Skiva." });
    expect(withStepText("Koka.", "Sjud.")).toBe("Sjud.");
  });
});

describe("hasPending, isDraftDirty and isShownField", () => {
  const draft: RecipeDraft = {
    title: "Soppa",
    servings: 4,
    totalMinutes: null,
    imageUrl: null,
    sourceKind: "text",
    sourceUrl: null,
    steps: ["Koka."],
    lines: [line],
  };

  it("counts typed text that is not a value yet as pending", () => {
    expect(hasPending({})).toBe(false);
    expect(hasPending({ amounts: {} })).toBe(false);
    expect(hasPending({ totalMinutes: "x" })).toBe(true);
    expect(hasPending({ amounts: { 0: "x" } })).toBe(true);
  });

  it("is dirty after a change or with pending text, not otherwise", () => {
    expect(isDraftDirty(draft, draft, {})).toBe(false);
    expect(isDraftDirty({ ...draft }, draft, {})).toBe(false);
    expect(isDraftDirty({ ...draft, title: "Gryta" }, draft, {})).toBe(true);
    expect(isDraftDirty(draft, draft, { totalMinutes: "x" })).toBe(true);
  });

  it("knows which errors the form shows under a field", () => {
    for (const path of ["title", "totalMinutes", "steps.3", "lines.0.amount"]) expect(isShownField(path)).toBe(true);
    for (const path of ["imageUrl", "sourceUrl", "sourceKind", "servings", "lines.0.isVague", "steps.0.text"]) {
      expect(isShownField(path)).toBe(false);
    }
  });
});

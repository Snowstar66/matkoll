import { describe, expect, it } from "vitest";
import { toSnapshot } from "./pantry-item";
import { atHomeSummaryText, recipeStatus, recipeStatusForFactor, recipeStatusText, type LineCoverage, type StatusLine } from "./recipe-status";

let lineId = 0;
const line = (overrides: Partial<StatusLine> & Pick<StatusLine, "ingredientId">): StatusLine => ({
  id: `line-${lineId++}`,
  amount: null,
  unit: null,
  isVague: false,
  ...overrides,
});
/** The lines' coverage in the recipe's order. */
const inOrder = (lines: readonly StatusLine[], byId: Record<string, LineCoverage>) => lines.map((line) => byId[line.id]);
const vague = (ingredientId: string | null) => line({ ingredientId, isVague: true });

const snapshot = toSnapshot([
  { ingredientId: "gradde", amount: 2, unit: "dl" },
  { ingredientId: "mjol", amount: 1, unit: "kg" },
  { ingredientId: "salt", amount: null, unit: null },
  { ingredientId: "lok", amount: 2, unit: "st" },
]);

/** The status with the lines' coverage in the recipe's order. */
function statusOf(lines: StatusLine[], servings = 4, recipeServings = 4) {
  const status = recipeStatus({ servings: recipeServings, lines }, servings, snapshot);
  return { missingCount: status.missingCount, lines: inOrder(lines, status.lines) };
}

describe("recipeStatus", () => {
  it("can be cooked when every line is covered", () => {
    expect(statusOf([line({ ingredientId: "gradde", amount: 2, unit: "dl" }), line({ ingredientId: "lok", amount: 1 }), vague("salt")])).toEqual({
      missingCount: 0,
      lines: [{ kind: "covered" }, { kind: "covered" }, { kind: "covered" }],
    });
  });

  it("counts missing, partial and other-unit ingredients in N", () => {
    const status = statusOf([
      line({ ingredientId: "gradde", amount: 3, unit: "dl" }),
      line({ ingredientId: "mjol", amount: 2, unit: "dl" }),
      line({ ingredientId: "agg", amount: 3, unit: "st" }),
    ]);
    expect(status).toEqual({
      missingCount: 3,
      lines: [
        { kind: "partial", remaining: 1, amounts: [{ unit: "dl", amount: 2 }] },
        { kind: "other-unit", amounts: [{ unit: "kg", amount: 1 }] },
        { kind: "missing" },
      ],
    });
  });

  it("sums lines before comparing, and shows the summed coverage on each of them", () => {
    const partial = { kind: "partial", remaining: 1, amounts: [{ unit: "dl", amount: 2 }] };
    expect(
      statusOf([line({ ingredientId: "gradde", amount: 1, unit: "dl" }), line({ ingredientId: "gradde", amount: 2, unit: "dl" })]),
    ).toEqual({ missingCount: 1, lines: [partial, partial] });
  });

  it("counts an ingredient once although several of its needs are short", () => {
    expect(statusOf([line({ ingredientId: "agg", amount: 2, unit: "st" }), line({ ingredientId: "agg", amount: 100, unit: "g" })]).missingCount).toBe(1);
  });

  it("never counts a vague line, and shows it as vague-missing when the ingredient is not at home", () => {
    expect(statusOf([vague("peppar"), vague("salt")])).toEqual({
      missingCount: 0,
      lines: [{ kind: "vague-missing" }, { kind: "covered" }],
    });
  });

  it("never counts a line without a catalog ingredient, and shows it as unlinked", () => {
    expect(statusOf([line({ ingredientId: null, amount: 2, unit: "st" }), vague(null), line({ ingredientId: "agg", amount: 1, unit: "st" })])).toEqual({
      missingCount: 1,
      lines: [{ kind: "unlinked" }, { kind: "unlinked" }, { kind: "missing" }],
    });
  });

  it("keys each line's coverage by its id", () => {
    const cream = line({ ingredientId: "gradde", amount: 1, unit: "dl" });
    const egg = line({ ingredientId: "agg", amount: 1, unit: "st" });
    expect(recipeStatus({ servings: 4, lines: [cream, egg] }, 4, snapshot).lines).toEqual({
      [cream.id]: { kind: "covered" },
      [egg.id]: { kind: "missing" },
    });
  });

  it("covers any amount with an unlimited item", () => {
    expect(statusOf([line({ ingredientId: "salt", amount: 3, unit: "msk" })]).missingCount).toBe(0);
  });

  it("compares an amount without unit as st", () => {
    expect(statusOf([line({ ingredientId: "lok", amount: 2 })]).missingCount).toBe(0);
    expect(statusOf([line({ ingredientId: "lok", amount: 3 })]).lines).toEqual([
      { kind: "partial", remaining: 1, amounts: [{ unit: "st", amount: 2 }] },
    ]);
  });

  it("scales the needs from the recipe's servings to `servings`", () => {
    const lines = [line({ ingredientId: "gradde", amount: 4, unit: "dl" })];
    expect(statusOf(lines, 2).missingCount).toBe(0);
    expect(statusOf(lines, 4).missingCount).toBe(1);
  });

  it("compares the recipe's own amounts when either servings is 0, negative or not a number", () => {
    const lines = [line({ ingredientId: "gradde", amount: 2, unit: "dl" })];
    for (const [servings, recipeServings] of [
      [0, 4],
      [4, 0],
      [Number.NaN, 4],
      [4, Number.NaN],
      [-2, 4],
      [Number.POSITIVE_INFINITY, 4],
    ]) {
      expect(statusOf(lines, servings, recipeServings)).toEqual({ missingCount: 0, lines: [{ kind: "covered" }] });
    }
  });

  it("can cook a recipe without lines", () => {
    expect(recipeStatus({ servings: 2, lines: [] }, 2, snapshot)).toEqual({
      missingCount: 0,
      ingredientCount: 0,
      atHomeCount: 0,
      lines: {},
    });
  });
});

describe("recipeStatus: X av Y hemma", () => {
  /** N, X and Y for `servings` of a recipe for 4. */
  function counts(lines: StatusLine[], servings = 4) {
    const { missingCount, atHomeCount, ingredientCount } = recipeStatus({ servings: 4, lines }, servings, snapshot);
    return { missingCount, atHomeCount, ingredientCount };
  }

  it("counts each catalog ingredient once in Y, and in X when all its needs are covered", () => {
    expect(
      counts([
        line({ ingredientId: "gradde", amount: 1, unit: "dl" }),
        line({ ingredientId: "gradde", amount: 1, unit: "dl" }),
        line({ ingredientId: "lok", amount: 1, unit: "st" }),
        line({ ingredientId: "agg", amount: 2, unit: "st" }),
      ]),
    ).toEqual({ missingCount: 1, atHomeCount: 2, ingredientCount: 3 });
  });

  it("follows the chosen servings over and under what is at home", () => {
    // 2 dl cream at home; the recipe needs 1 dl for 4.
    const lines = [line({ ingredientId: "gradde", amount: 1, unit: "dl" }), line({ ingredientId: "salt", amount: 1, unit: "tsk" })];
    expect(counts(lines, 8)).toEqual({ missingCount: 0, atHomeCount: 2, ingredientCount: 2 });
    expect(counts(lines, 10)).toEqual({ missingCount: 1, atHomeCount: 1, ingredientCount: 2 });
    expect(counts(lines, 1)).toEqual({ missingCount: 0, atHomeCount: 2, ingredientCount: 2 });
  });

  it("counts an ingredient with only vague lines in Y, and in X only when it is at home; never in N", () => {
    expect(counts([vague("salt")])).toEqual({ missingCount: 0, atHomeCount: 1, ingredientCount: 1 });
    expect(counts([vague("peppar")])).toEqual({ missingCount: 0, atHomeCount: 0, ingredientCount: 1 });
  });

  it("keeps an ingredient with a vague line and an amount out of X when the amount is short", () => {
    const lines = [vague("gradde"), line({ ingredientId: "gradde", amount: 1, unit: "dl" })];
    expect(counts(lines)).toEqual({ missingCount: 0, atHomeCount: 1, ingredientCount: 1 });
    expect(counts(lines, 12)).toEqual({ missingCount: 1, atHomeCount: 0, ingredientCount: 1 });
    const missing = [vague("agg"), line({ ingredientId: "agg", amount: 1, unit: "st" })];
    expect(counts(missing)).toEqual({ missingCount: 1, atHomeCount: 0, ingredientCount: 1 });
  });

  it("never counts a line without a catalog ingredient in X or Y", () => {
    expect(counts([line({ ingredientId: null, amount: 2, unit: "st" }), vague(null), vague("salt")])).toEqual({
      missingCount: 0,
      atHomeCount: 1,
      ingredientCount: 1,
    });
    expect(counts([line({ ingredientId: null, amount: 2, unit: "st" })])).toEqual({
      missingCount: 0,
      atHomeCount: 0,
      ingredientCount: 0,
    });
  });

  it("leaves N as it was: X and Y only add to it", () => {
    const lines = [
      line({ ingredientId: "gradde", amount: 3, unit: "dl" }),
      line({ ingredientId: "mjol", amount: 2, unit: "dl" }),
      line({ ingredientId: "agg", amount: 3, unit: "st" }),
      vague("peppar"),
    ];
    expect(counts(lines)).toEqual({ missingCount: 3, atHomeCount: 0, ingredientCount: 4 });
  });
});

describe("recipeStatusForFactor", () => {
  it("is recipeStatus for the same factor, and compares the own amounts for a factor that is not positive", () => {
    const lines = [line({ ingredientId: "gradde", amount: 1, unit: "dl" }), vague("salt")];
    expect(recipeStatusForFactor(lines, 2.5, snapshot)).toEqual(recipeStatus({ servings: 4, lines }, 10, snapshot));
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(recipeStatusForFactor(lines, factor, snapshot)).toEqual(recipeStatusForFactor(lines, 1, snapshot));
    }
  });
});

describe("atHomeSummaryText", () => {
  it("says X av Y hemma", () => {
    expect(atHomeSummaryText(7, 9)).toBe("7 av 9 hemma");
    expect(atHomeSummaryText(0, 1)).toBe("0 av 1 hemma");
  });
});

describe("recipeStatusText", () => {
  it("says Kan lagas nu, Saknar 1 vara or Saknar N varor", () => {
    expect(recipeStatusText(0)).toBe("Kan lagas nu");
    expect(recipeStatusText(1)).toBe("Saknar 1 vara");
    expect(recipeStatusText(2)).toBe("Saknar 2 varor");
  });
});

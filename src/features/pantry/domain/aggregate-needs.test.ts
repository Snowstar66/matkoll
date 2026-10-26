import { describe, expect, it } from "vitest";
import { aggregateNeeds, lineNeedKey, needKey, type NeedLine } from "./aggregate-needs";

const line = (overrides: Partial<NeedLine> & Pick<NeedLine, "ingredientId">): NeedLine => ({
  amount: null,
  unit: null,
  isVague: false,
  ...overrides,
});

describe("aggregateNeeds", () => {
  it("sums lines of the same ingredient and unit", () => {
    const needs = aggregateNeeds(
      [
        line({ ingredientId: "gradde", amount: 1, unit: "dl" }),
        line({ ingredientId: "gradde", amount: 2, unit: "dl" }),
      ],
      1,
    );
    expect(needs).toEqual([{ ingredientId: "gradde", amount: 3, unit: "dl" }]);
  });

  it("keeps units apart and never converts them, in the order each need first appears", () => {
    const needs = aggregateNeeds(
      [
        line({ ingredientId: "mjol", amount: 2, unit: "dl" }),
        line({ ingredientId: "smor", amount: 50, unit: "g" }),
        line({ ingredientId: "mjol", amount: 100, unit: "g" }),
        line({ ingredientId: "mjol", amount: 1, unit: "dl" }),
      ],
      1,
    );
    expect(needs).toEqual([
      { ingredientId: "mjol", amount: 3, unit: "dl" },
      { ingredientId: "smor", amount: 50, unit: "g" },
      { ingredientId: "mjol", amount: 100, unit: "g" },
    ]);
  });

  it("counts an amount without unit as st, together with lines in st", () => {
    const needs = aggregateNeeds(
      [line({ ingredientId: "purjolok", amount: 1 }), line({ ingredientId: "purjolok", amount: 2, unit: "st" })],
      1,
    );
    expect(needs).toEqual([{ ingredientId: "purjolok", amount: 3, unit: "st" }]);
  });

  it("makes vague lines one need of the ingredient in any form, beside its amounts", () => {
    const needs = aggregateNeeds(
      [
        line({ ingredientId: "salt", isVague: true }),
        line({ ingredientId: "salt", amount: 1, unit: "tsk" }),
        line({ ingredientId: "salt", isVague: true }),
      ],
      1,
    );
    expect(needs).toEqual([
      { ingredientId: "salt", amount: null, unit: null },
      { ingredientId: "salt", amount: 1, unit: "tsk" },
    ]);
  });

  it("leaves out lines without a catalog ingredient", () => {
    expect(aggregateNeeds([line({ ingredientId: null, amount: 2, unit: "st" }), line({ ingredientId: null, isVague: true })], 1)).toEqual([]);
  });

  it("multiplies amounts by the factor and rounds sums to 1e-6", () => {
    expect(aggregateNeeds([line({ ingredientId: "gradde", amount: 1.5, unit: "dl" })], 2)).toEqual([
      { ingredientId: "gradde", amount: 3, unit: "dl" },
    ]);
    expect(
      aggregateNeeds(
        [line({ ingredientId: "gradde", amount: 0.1, unit: "dl" }), line({ ingredientId: "gradde", amount: 0.2, unit: "dl" })],
        1,
      ),
    ).toEqual([{ ingredientId: "gradde", amount: 0.3, unit: "dl" }]);
  });
});

describe("needKey and lineNeedKey", () => {
  it("give a line the key of the need it counts towards", () => {
    expect(lineNeedKey(line({ ingredientId: "mjol", amount: 2, unit: "dl" }))).toBe(needKey({ ingredientId: "mjol", amount: 2, unit: "dl" }));
    expect(lineNeedKey(line({ ingredientId: "lok", amount: 1 }))).toBe("lok:st");
    expect(lineNeedKey(line({ ingredientId: "salt", isVague: true }))).toBe("salt:-");
    expect(lineNeedKey(line({ ingredientId: null, amount: 1, unit: "st" }))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  compareStaples,
  convertAmount,
  isStaple,
  noStaples,
  parseStapleLimit,
  stapleFormSchema,
  stapleLimitFor,
  stapleLimitText,
  stapleRules,
  staplesCountText,
  withinStapleLimit,
  type Staple,
} from "./staples";

const staple = (name: string, maxAmount: number | null = null, maxUnit: Staple["maxUnit"] = null): Staple =>
  ({ id: name, name, normalizedName: name.toLocaleLowerCase("sv-SE"), maxAmount, maxUnit }) as Staple;

const rules = stapleRules(
  [staple("Salt"), staple("Vetemjöl", 1, "dl"), staple("Smör", 50, "g"), staple("Olivolja", 1, "dl")],
  { salt: ["id-salt"], vetemjöl: ["id-mjol"], smör: ["id-smor"] },
);

describe("convertAmount", () => {
  it("converts within volume and within weight", () => {
    expect(convertAmount(3, "msk", "dl")).toBeCloseTo(0.45);
    expect(convertAmount(2, "tsk", "msk")).toBeCloseTo(2 / 3);
    expect(convertAmount(1, "l", "dl")).toBe(10);
    expect(convertAmount(5, "krm", "ml")).toBe(5);
    expect(convertAmount(25, "cl", "dl")).toBe(2.5);
    expect(convertAmount(0.5, "kg", "g")).toBe(500);
  });

  it("counts a millilitre as a gram between volume and weight", () => {
    expect(convertAmount(2, "msk", "g")).toBe(30);
    expect(convertAmount(300, "g", "dl")).toBe(3);
  });

  it("never converts units that count things", () => {
    expect(convertAmount(1, "st", "g")).toBeNull();
    expect(convertAmount(1, "förp", "dl")).toBeNull();
    expect(convertAmount(1, "g", "klyfta")).toBeNull();
  });
});

describe("withinStapleLimit", () => {
  const flour = { maxAmount: 1, maxUnit: "dl" } as const;
  it("is always within for a staple without a limit, whatever the amount", () => {
    expect(withinStapleLimit({ maxAmount: null, maxUnit: null }, 5, "kg")).toBe(true);
    expect(withinStapleLimit({ maxAmount: null, maxUnit: null }, 2, null)).toBe(true);
  });

  it("counts a need without an amount as small", () => {
    expect(withinStapleLimit(flour, null, null)).toBe(true);
  });

  it("compares the need in the limit's unit, the limit itself included", () => {
    expect(withinStapleLimit(flour, 1, "dl")).toBe(true);
    expect(withinStapleLimit(flour, 2, "msk")).toBe(true);
    expect(withinStapleLimit(flour, 100, "ml")).toBe(true);
    expect(withinStapleLimit(flour, 1.5, "dl")).toBe(false);
    expect(withinStapleLimit(flour, 5, "dl")).toBe(false);
    expect(withinStapleLimit(flour, 7, "msk")).toBe(false);
    // Binary noise on the edge: 0,1 l + 0 is still 1 dl.
    expect(withinStapleLimit(flour, 0.1 + 1e-12, "l")).toBe(true);
  });

  it("is not within for a need in pieces, which cannot be converted", () => {
    expect(withinStapleLimit({ maxAmount: 50, maxUnit: "g" }, 1, "förp")).toBe(false);
    expect(withinStapleLimit({ maxAmount: 50, maxUnit: "g" }, 1, null)).toBe(false);
  });
});

describe("stapleLimitFor and isStaple", () => {
  it("finds a staple by its catalog ingredient, else by name compared normalised", () => {
    expect(stapleLimitFor(rules, "id-salt")).toEqual({ maxAmount: null, maxUnit: null });
    expect(stapleLimitFor(rules, "id-other", "Olivolja")).toEqual({ maxAmount: 1, maxUnit: "dl" });
    expect(stapleLimitFor(rules, null, "2 msk olivolja, till stekning")).toEqual({ maxAmount: 1, maxUnit: "dl" });
    expect(stapleLimitFor(rules, null, "Salt efter smak")).toEqual({ maxAmount: null, maxUnit: null });
    expect(stapleLimitFor(rules, "id-lok", "Gul lök")).toBeNull();
  });

  it("never takes a name from the object's prototype", () => {
    expect(stapleLimitFor(rules, "constructor", "constructor")).toBeNull();
    expect(stapleLimitFor(noStaples, "toString", "hasOwnProperty")).toBeNull();
  });

  it("is a staple within the limit, and not above it (baking)", () => {
    expect(isStaple(rules, { ingredientId: "id-mjol", amount: 2, unit: "msk" })).toBe(true);
    expect(isStaple(rules, { ingredientId: "id-mjol", amount: 5, unit: "dl" })).toBe(false);
    expect(isStaple(rules, { ingredientId: "id-smor", amount: 2, unit: "msk" })).toBe(true);
    expect(isStaple(rules, { ingredientId: "id-smor", amount: 100, unit: "g" })).toBe(false);
    expect(isStaple(rules, { ingredientId: "id-salt", amount: 1, unit: "tsk" })).toBe(true);
    expect(isStaple(rules, { ingredientId: "id-lok", amount: 1, unit: "st" })).toBe(false);
    expect(isStaple(noStaples, { ingredientId: "id-salt", amount: null, unit: null })).toBe(false);
  });

  it("lets the first staple win when two reach the same ingredient", () => {
    const both = stapleRules([staple("Mjöl", 1, "dl"), staple("Vetemjöl", 3, "dl")], { mjöl: ["x"], vetemjöl: ["x"] });
    expect(both.byIngredient.x).toEqual({ maxAmount: 1, maxUnit: "dl" });
  });
});

describe("parseStapleLimit", () => {
  it("reads an empty field as always, and amounts with a unit of volume or weight", () => {
    expect(parseStapleLimit("  ")).toEqual({ maxAmount: null, maxUnit: null });
    expect(parseStapleLimit("1 dl")).toEqual({ maxAmount: 1, maxUnit: "dl" });
    expect(parseStapleLimit("1,5dl")).toEqual({ maxAmount: 1.5, maxUnit: "dl" });
    expect(parseStapleLimit("50 g")).toEqual({ maxAmount: 50, maxUnit: "g" });
    expect(parseStapleLimit("2 matskedar")).toEqual({ maxAmount: 2, maxUnit: "msk" });
    expect(parseStapleLimit("½ tsk")).toEqual({ maxAmount: 0.5, maxUnit: "tsk" });
  });

  it("refuses what is not a positive amount of volume or weight", () => {
    for (const text of ["dl", "1", "2 st", "1 förp", "0 dl", "-1 dl", "mycket", "1 näve", "999999 g"]) {
      expect(parseStapleLimit(text), text).toBeNull();
    }
  });
});

describe("texts and the form", () => {
  it("says the limit in words", () => {
    expect(stapleLimitText({ maxAmount: null, maxUnit: null })).toBe("alltid");
    expect(stapleLimitText({ maxAmount: 1, maxUnit: "dl" })).toBe("upp till 1 dl");
    expect(stapleLimitText({ maxAmount: 1.5, maxUnit: "dl" })).toBe("upp till 1,5 dl");
    expect(stapleLimitText({ maxAmount: 50, maxUnit: "g" })).toBe("upp till 50 g");
  });

  it("counts them", () => {
    expect(staplesCountText(1)).toBe("1 basvara");
    expect(staplesCountText(21)).toBe("21 basvaror");
  });

  it("sorts the always ones first, then by name", () => {
    const sorted = [staple("Vetemjöl", 1, "dl"), staple("Vatten"), staple("Socker", 1, "dl"), staple("Anis")].sort(compareStaples);
    expect(sorted.map((s) => s.name)).toEqual(["Anis", "Vatten", "Socker", "Vetemjöl"]);
  });

  it("takes a name of 1 to 60 characters with something to match", () => {
    expect(stapleFormSchema.parse({ name: "  Kardemumma\n ", limit: "" })).toEqual({ name: "Kardemumma", limit: "" });
    expect(stapleFormSchema.safeParse({ name: " ", limit: "" }).success).toBe(false);
    expect(stapleFormSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
    expect(stapleFormSchema.parse({ name: "Salt" })).toEqual({ name: "Salt", limit: "" });
  });
});

import { describe, expect, it } from "vitest";
import { food, per } from "./fixtures";
import { GARLIC_CLOVE_G, toGrams } from "./grams";

const flour = food("vetemjöl", "raffinerad", per(352), { gramsPerDl: 60 });
const egg = food("ägg", "agg", per(136), { gramsPerPiece: 55 });
const meat = food("nötfärs", "rott_kott", per(211));
const garlic = food("vitlök", "gronsak", per(128), { gramsPerPiece: 40, lmvNumber: 371 });

describe("toGrams", () => {
  it("converts weights", () => {
    expect(toGrams(500, "g", meat)).toBe(500);
    expect(toGrams(1.5, "kg", meat)).toBe(1500);
    expect(toGrams(2, "hg", meat)).toBe(200);
  });

  it("converts volumes with the density", () => {
    expect(toGrams(2, "dl", flour)).toBe(120);
    expect(toGrams(1, "l", flour)).toBe(600);
    expect(toGrams(250, "ml", flour)).toBe(150);
    expect(toGrams(10, "cl", flour)).toBe(60);
    expect(toGrams(1, "msk", flour)).toBeCloseTo(9);
    expect(toGrams(2, "tsk", flour)).toBeCloseTo(6);
    expect(toGrams(1, "krm", flour)).toBeCloseTo(0.6);
  });

  it("gives null for a volume without a density", () => {
    expect(toGrams(2, "dl", meat)).toBeNull();
  });

  it("converts pieces, also with no unit", () => {
    expect(toGrams(3, "st", egg)).toBe(165);
    expect(toGrams(2, null, egg)).toBe(110);
    expect(toGrams(2, "st", meat)).toBeNull();
    expect(toGrams(2, null, meat)).toBeNull();
  });

  it("counts a clove as 4 g for garlic only", () => {
    expect(toGrams(3, "klyfta", garlic)).toBe(3 * GARLIC_CLOVE_G);
    expect(toGrams(1, "klyfta", egg)).toBeNull();
  });

  it("gives null for sizes that are not known", () => {
    for (const unit of ["förp", "kruka", "knippe", "skiva", "näve", "burk"]) expect(toGrams(1, unit, flour)).toBeNull();
  });

  it("gives null without a usable amount", () => {
    expect(toGrams(null, "g", meat)).toBeNull();
    expect(toGrams(0, "g", meat)).toBeNull();
    expect(toGrams(-1, "g", meat)).toBeNull();
    expect(toGrams(Number.NaN, "g", meat)).toBeNull();
  });

  it("ignores case in the unit", () => {
    expect(toGrams(1, "DL", flour)).toBe(60);
  });
});

import { describe, expect, it } from "vitest";
import { isTrustworthy } from "@/features/nutrition";
import { run } from "./nutrition-kladdkaka-fixture";

// Regression: koket.se "Godaste och härligaste kladdkakan på klassiskt vis" (recipeYield "10-12 bitar") showed no
// kcal. The lines go through the real chain (see the fixture) and the trust gate of the card.

describe("Godaste och härligaste kladdkakan", () => {
  for (const [sugar, brown, vanilla] of [
    ["strösocker", "farinsocker", "vaniljsocker"],
    ["strösocker", "brunt farinsocker", "vaniljsocker"],
    ["socker", "brun farinsocker", "vaniljsocker"],
  ]) {
    for (const servings of [10, 12]) {
      it(`is counted per bit at ${servings} bitar (${brown})`, () => {
        const { result } = run(servings, sugar, brown, vanilla);
        if (process.env.DUMP) console.log(JSON.stringify(result, null, 1));
        expect(result.uncounted).toEqual([]);
        expect(result.coverage.counted).toBe(result.coverage.total);
        expect(isTrustworthy(result.coverage)).toBe(true);
        // Butter, sugar, flour and eggs: about 4300 kcal, with cocoa and the rest about 4900.
        expect(result.perServing.kcal * servings).toBeGreaterThan(3800);
        expect(result.perServing.kcal * servings).toBeLessThan(5200);
        expect(result.perServing.kcal).toBeGreaterThan(350);
        expect(result.perServing.kcal).toBeLessThan(500);
      });
    }
  }
});

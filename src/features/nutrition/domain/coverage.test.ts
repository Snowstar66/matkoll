import { describe, expect, it } from "vitest";
import { nutritionCheck } from "./coverage";
import { food, line, per } from "./fixtures";
import { checkCountText, checkMissingText } from "./texts";

const rows = {
  pasta: food("pasta", "raffinerad", per(350, 12, 1.5, 70, 3), { gramsPerDl: 40 }),
  tomato: food("krossade tomater", "gronsak", per(22), { gramsPerDl: 100 }),
};
const named = (id: string | null, amount: number, unit: string, name: string | null) => ({ ...line(id, amount, unit), ingredientName: name });

describe("nutritionCheck", () => {
  const good = { servings: 4, lines: [named("pasta", 400, "g", "pasta"), named("pasta", 2, "dl", "pasta"), named("tomato", 3, "dl", "krossade tomater")] };
  const blocked = (name: string) => ({
    servings: 4,
    lines: [named("pasta", 400, "g", "pasta"), named("tomato", 1, "kvist", "krossade tomater"), named(null, 500, "g", name)],
  });

  it("counts the recipes that pass the gate of the cards", () => {
    const check = nutritionCheck([good, blocked("fransyska"), blocked("fransyska"), good], rows);
    expect(check.total).toBe(4);
    expect(check.counted).toBe(2);
    expect(checkCountText(check)).toBe("Näringen kan räknas för 2 av 4 recept.");
  });

  it("names the missing ingredients, the unit only when the unit is the reason, most recipes first", () => {
    const check = nutritionCheck([blocked("fransyska"), blocked("fransyska"), blocked("biff")], rows);
    expect(check.missing).toEqual([
      { name: "krossade tomater", unit: "kvist", recipes: 3 },
      { name: "fransyska", unit: null, recipes: 2 },
      { name: "biff", unit: null, recipes: 1 },
    ]);
    expect(checkMissingText(check)).toBe("Saknas oftast: krossade tomater (kvist), fransyska, biff.");
  });

  it("names at most five and counts a recipe once per item", () => {
    const names = ["a1", "b2", "c3", "d4", "e5", "f6", "g7"];
    const check = nutritionCheck([{ servings: 1, lines: [...names, ...names].map((name) => named(null, 100, "g", name)) }], rows);
    expect(check.missing).toHaveLength(5);
    expect(check.missing.every((item) => item.recipes === 1)).toBe(true);
  });

  it("says nothing without recipes, and nothing is missing when all pass", () => {
    const none = nutritionCheck([], rows);
    expect(none).toEqual({ total: 0, counted: 0, missing: [] });
    expect(checkCountText(none)).toBeNull();
    expect(checkMissingText(nutritionCheck([good], rows))).toBeNull();
  });
});

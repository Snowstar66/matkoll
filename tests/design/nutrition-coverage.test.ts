import { describe, expect, it } from "vitest";
import {
  COMPOUND_HEADS,
  isTrustworthy,
  nutritionCheck,
  recipeNutrition,
  type IngredientNutrition,
  type NutritionLine,
} from "@/features/nutrition";
import { PACKAGE_GRAMS } from "../../scripts/nutrition-mapping.mjs";
import { recipes, type Recipe } from "./nutrition-recipes";
import { buildTable, resolveName } from "./nutrition-table";

// Realistic Swedish recipes (nutrition-recipes.ts) run over the real table (the mapping and the committed values),
// to see that the nutrition can be counted for most of them and that the kcal is plausible.

function linesOf(recipe: Recipe, table: Record<string, IngredientNutrition>, prefix = ""): { lines: NutritionLine[]; byId: Record<string, IngredientNutrition> } {
  const byId: Record<string, IngredientNutrition> = {};
  const lines = recipe.lines.map(([amount, unit, name], index): NutritionLine => {
    const row = name ? resolveName(table, name) : null;
    const ingredientId = name ? `${prefix}i${index}` : null;
    if (row && ingredientId) byId[ingredientId] = row;
    return { amount, unit, isVague: false, ingredientId, ingredientName: name || null, originalText: name || "okänd rad" };
  });
  return { lines, byId };
}

const table = buildTable();

describe("recipes the nutrition can be counted for", () => {
  it("counts most of ten realistic recipes with plausible kcal", () => {
    const trusted: string[] = [];
    for (const recipe of recipes) {
      const { lines, byId } = linesOf(recipe, table);
      const result = recipeNutrition(lines, byId, recipe.servings);
      const ok = isTrustworthy(result.coverage);
      if (recipe.unsure) {
        expect(ok, `${recipe.title} stays unsure`).toBe(false);
        continue;
      }
      expect(ok, `${recipe.title}: ${result.uncounted.map((line) => line.label).join(", ")}`).toBe(true);
      trusted.push(recipe.title);
      const [low, high] = recipe.kcal ?? [0, 5000];
      expect(result.perServing.kcal, `${recipe.title} kcal per portion`).toBeGreaterThan(low);
      expect(result.perServing.kcal, `${recipe.title} kcal per portion`).toBeLessThan(high);
    }
    expect(trusted.length).toBe(10);
  });

  it("checks all of them at once with the gate of the cards, and names what is missing", () => {
    const byId: Record<string, IngredientNutrition> = {};
    const checked = recipes.map((recipe, r) => {
      const one = linesOf(recipe, table, `r${r}-`);
      Object.assign(byId, one.byId);
      return { lines: one.lines, servings: recipe.servings };
    });
    const check = nutritionCheck(checked, byId);
    expect(check.total).toBe(11);
    expect(check.counted).toBe(10);
    // The one that stays unsure has no named ingredient on three lines, so nothing is named as missing.
    expect(check.missing).toEqual([]);
  });

  it("names an ingredient and, when the unit is the reason, the unit", () => {
    const rows = buildTable({ packages: false });
    const byId: Record<string, IngredientNutrition> = {};
    const checked = [0, 1].map((r) => {
      const one = linesOf(recipes[4], rows, `r${r}-`);
      Object.assign(byId, one.byId);
      return { lines: one.lines, servings: 4 };
    });
    const check = nutritionCheck(checked, byId);
    expect(check.counted).toBe(0);
    expect(check.missing).toContainEqual({ name: "krossade tomater", unit: "förp", recipes: 2 });
    expect(check.missing).toContainEqual({ name: "färsk basilika", unit: "kruka", recipes: 2 });
  });
});

describe("package weights", () => {
  it("are only for names in the table", () => {
    for (const name of Object.keys(PACKAGE_GRAMS)) expect(table[name], name).toBeDefined();
  });
  it("are sensible", () => {
    for (const [name, grams] of Object.entries(PACKAGE_GRAMS as Record<string, number>)) {
      expect(grams, name).toBeGreaterThanOrEqual(20);
      expect(grams, name).toBeLessThanOrEqual(600);
    }
  });
  it("are not given to things counted as not counted", () => {
    for (const name of Object.keys(PACKAGE_GRAMS)) expect(table[name].group, name).not.toBe("ej_raknad");
  });
});

describe("the compound allowlist", () => {
  it("only has heads that have a row of their own", () => {
    for (const head of COMPOUND_HEADS) expect(table[head], head).toBeDefined();
  });
  it("finds the new long-tail names", () => {
    for (const name of ["pankoströbröd", "caesardressing", "chipotlepasta", "spagettipumpa", "färsk grön jalapeño", "brioche burger bun", "tryffelolja"]) {
      expect(resolveName(table, name), name).not.toBeNull();
    }
    expect(resolveName(table, "chipotlepasta")?.group).toBe("ej_raknad");
    expect(resolveName(table, "pankoströbröd")?.lmvNumber).toBe(188);
    expect(resolveName(table, "kycklingbuljong")?.group).toBe("ej_raknad");
  });
  it("does not guess pasta, mjöl or socker", () => {
    for (const name of ["trollpasta", "bovetemjöl", "kokossocker", "quornfärs", "havreyoghurt", "mandelsmör"]) {
      expect(resolveName(table, name), name).toBeNull();
    }
  });
});

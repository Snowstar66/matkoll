import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { KOSTRAD_GROUPS } from "@/features/nutrition";
import { MAPPING } from "../../scripts/nutrition-mapping.mjs";

// The nutrition data is generated (scripts/nutrition-data.mjs) from a curated
// mapping and the values fetched from Livsmedelsverket. These checks keep the
// migration's check list equal to the domain's groups, the seed equal to the
// committed JSON and mapping, and every mapped name in the form the catalog
// matches on.

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const sql = readFileSync(path("../../supabase/migrations/20261108120000_ingredient_nutrition.sql"), "utf8");
const data = JSON.parse(readFileSync(path("../../scripts/nutrition-data/livsmedelsverket.json"), "utf8")) as {
  license: string;
  foods: Record<string, { name: string; kcal: number; protein_g: number; fat_g: number; carbs_g: number; fiber_g: number }>;
};

type Entry = readonly [string[], number | null, string, number | null, number | null];
const mapping = MAPPING as readonly Entry[];

describe("nutrition migration", () => {
  it("has the check list of the domain's groups, in order", () => {
    const match = /kostrad_group in \(([^)]*)\)/.exec(sql);
    expect(match).not.toBeNull();
    expect([...match![1].matchAll(/'([^']*)'/g)].map((value) => value[1])).toEqual([...KOSTRAD_GROUPS]);
  });

  it("is purely additive", () => {
    const code = sql
      .split("\n")
      .filter((row) => !row.trimStart().startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/\b(drop|delete|truncate)\b/i);
    expect(code).not.toMatch(/alter table public\.(?!ingredient_nutrition\b)/i);
  });

  it("seeds one row per mapped name, with the values of the committed data", () => {
    const rows = [...sql.matchAll(/^ {2}\('([^']+)', (\d+|null), /gm)];
    const names = mapping.flatMap((entry) => entry[0]).map((name) => name.normalize("NFC").trim().toLocaleLowerCase("sv-SE"));
    expect(rows.map((row) => row[1]).sort()).toEqual([...names].sort());
    for (const [names_, lmv] of mapping) {
      if (lmv === null) continue;
      const food = data.foods[lmv];
      expect(food, `food ${lmv} (${names_[0]}) is in the data`).toBeDefined();
      expect(sql).toContain(`${food.kcal}, ${food.protein_g}, ${food.fat_g}, ${food.carbs_g}, ${food.fiber_g}`);
    }
  });

  it("records the licence", () => {
    expect(data.license).toBe("CC BY 4.0");
    expect(sql).toContain("CC BY 4.0");
  });
});

describe("nutrition mapping", () => {
  const names = mapping.flatMap((entry) => entry[0]);

  it("has no duplicate names", () => {
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses names in the form the catalog matches on", () => {
    const changed = names.filter((name) => normalizeIngredientText(name) !== name).map((name) => `${name} -> ${normalizeIngredientText(name)}`);
    expect(changed).toEqual([]);
  });

  it("uses only known groups, and null food only for ej_raknad", () => {
    for (const [mapped, lmv, group] of mapping) {
      expect(KOSTRAD_GROUPS, mapped[0]).toContain(group);
      expect(lmv === null, mapped[0]).toBe(group === "ej_raknad");
    }
  });

  it("has sane piece weights and densities", () => {
    for (const [mapped, , , perPiece, perDl] of mapping) {
      if (perPiece !== null) expect(perPiece, mapped[0]).toBeGreaterThan(0);
      if (perDl !== null) expect(perDl, mapped[0]).toBeGreaterThanOrEqual(5);
      if (perDl !== null) expect(perDl, mapped[0]).toBeLessThan(200);
    }
  });

  it("has plausible energy: atwater from the macros is within 25% of the stated kcal", () => {
    for (const [mapped, lmv] of mapping) {
      if (lmv === null) continue;
      const food = data.foods[lmv];
      const atwater = food.protein_g * 4 + food.carbs_g * 4 + food.fat_g * 9 + food.fiber_g * 2;
      if (food.kcal < 30) continue; // watery foods: rounding dominates
      expect(Math.abs(atwater - food.kcal) / food.kcal, `${mapped[0]} (${food.name})`).toBeLessThan(0.25);
    }
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { KOSTRAD_GROUPS, isTrustworthy, nameCandidates, recipeNutrition, type IngredientNutrition, type NutritionLine } from "@/features/nutrition";
import { MAPPING, PACKAGE_GRAMS } from "../../scripts/nutrition-mapping.mjs";

// The nutrition data is generated (scripts/nutrition-data.mjs) from a curated
// mapping and the values fetched from Livsmedelsverket. These checks keep the
// migration's check list equal to the domain's groups, the seed equal to the
// committed JSON and mapping, and every mapped name in the form the catalog
// matches on.

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
// The first migration and the first additions (both applied, never edited), and the package-weights migration
// (the column grams_per_package and upserts of new and changed rows).
const packageSql = readFileSync(path("../../supabase/migrations/20261108220000_ingredient_nutrition_package_weights.sql"), "utf8");
const sql =
  readFileSync(path("../../supabase/migrations/20261108120000_ingredient_nutrition.sql"), "utf8") +
  readFileSync(path("../../supabase/migrations/20261108180000_ingredient_nutrition_additions.sql"), "utf8") +
  packageSql +
  readFileSync(path("../../supabase/migrations/20261110120000_ingredient_nutrition_thai.sql"), "utf8") +
  readFileSync(path("../../supabase/migrations/20261117120000_ingredient_nutrition_corn_tortilla_pizza_sauce.sql"), "utf8");
const data = JSON.parse(readFileSync(path("../../scripts/nutrition-data/livsmedelsverket.json"), "utf8")) as {
  license: string;
  foods: Record<string, { name: string; kcal: number; protein_g: number; fat_g: number; carbs_g: number; fiber_g: number }>;
};

type Entry = readonly [string[], number | null, string, number | null, number | null, number?];
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
    expect([...new Set(rows.map((row) => row[1]))].sort()).toEqual([...names].sort());
    for (const [names_, lmv] of mapping) {
      if (lmv === null) continue;
      const food = data.foods[lmv];
      expect(food, `food ${lmv} (${names_[0]}) is in the data`).toBeDefined();
      expect(sql).toContain(`${food.kcal}, ${food.protein_g}, ${food.fat_g}, ${food.carbs_g}, ${food.fiber_g}`);
    }
  });

  it("adds the package weight column and gives every package weight of the mapping to its row", () => {
    expect(packageSql).toContain("add column grams_per_package numeric(7, 1)");
    for (const [name, grams] of Object.entries(PACKAGE_GRAMS as Record<string, number>)) {
      const row = new RegExp(`^ {2}\\('${name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}', .*, ${grams}\\),?$`, "m");
      expect(packageSql, name).toMatch(row);
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

  it("maps the reviewed names to the right foods and weights", () => {
    const find = (name: string) => mapping.find((entry) => entry[0].includes(name))!;
    expect(find("lax")[1]).toBe(1255);
    expect(find("feta")[1]).toBe(94);
    expect(find("röda linser")[1]).toBe(884);
    expect(find("bruna bönor")[1]).toBe(875);
    expect(find("lingonsylt")[1]).toBe(1798);
    expect(find("vetemjöl fullkorn")[1]).toBe(1935);
    expect(find("mjölk")[1]).toBe(123);
    expect(find("turkisk yoghurt")[1]).toBe(6113);
    expect(find("kakaopulver")[1]).toBe(1886);
    expect(find("apelsinjuice")[2]).toBe("ovrigt");
    expect(find("fryst spenat")[1]).toBe(361);
    expect([find("baguette")[3], find("ciabatta")[3], find("limpa")[3], find("kyckling")[3], find("fläskkorv")[3]]).toEqual([250, 250, 700, 1200, 600]);
    expect([find("bröd")[5], find("bacon")[5], find("skinka")[5], find("salami")[5], find("riven ost")[5]]).toEqual([30, 12, 15, 5, 10]);
    expect(find("vitlöksklyfta")[3]).toBe(4);
    expect(names.includes("tortellini")).toBe(false);
    // Corn tortilla: no corn one in LMV, so 6878 (gluten-free tortilla) stands in, 50 g as the recipe says; pizza sauce: 5726.
    expect([find("majstortilla")[1], find("majstortillor")[3], find("majstortillas")[2]]).toEqual([6878, 50, "raffinerad"]);
    expect([find("pizzasås")[1], find("pizzasås")[4], find("pizzasås tomat")[1]]).toEqual([5726, 100, 5726]);
  });

  it("has sane piece weights and densities", () => {
    for (const [mapped, , , perPiece, perDl] of mapping) {
      if (perPiece !== null) expect(perPiece, mapped[0]).toBeGreaterThan(0);
      if (perDl !== null) expect(perDl, mapped[0]).toBeGreaterThanOrEqual(5);
      if (perDl !== null) expect(perDl, mapped[0]).toBeLessThan(200);
    }
  });

  it("has package weights only for mapped names, and no volume-less density or piece weight mix-ups", () => {
    const mapped = new Set(names);
    for (const name of Object.keys(PACKAGE_GRAMS)) expect(mapped.has(name), name).toBe(true);
  });

  it("has plausible energy: atwater from the macros is within 25% of the stated kcal", () => {
    for (const [mapped, lmv] of mapping) {
      if (lmv === null) continue;
      const food = data.foods[lmv];
      const atwater = food.protein_g * 4 + food.carbs_g * 4 + food.fat_g * 9 + food.fiber_g * 2;
      if (food.kcal < 30) continue; // watery foods: rounding dominates
      if (food.name.includes("vol. %")) continue; // wine and beer: the energy of the alcohol is not in the macros
      expect(Math.abs(atwater - food.kcal) / food.kcal, `${mapped[0]} (${food.name})`).toBeLessThan(0.25);
    }
  });
});

// "Tortillapizza med kalkon och vitlökssås" (recept.se): "2 majstortillor (à 50 g)" and "1 dl pizzasås, tomat" were
// "unknown ingredient", so the recipe showed no kcal. Built from the mapping and the committed data, as the table is seeded.
describe("Tortillapizza med kalkon och vitlökssås", () => {
  const table: Record<string, IngredientNutrition> = {};
  for (const [names_, lmv, group, perPiece, perDl, perSlice] of mapping) {
    const food = lmv === null ? null : data.foods[lmv];
    for (const name of names_) {
      table[name] = {
        name,
        group: group as IngredientNutrition["group"],
        lmvNumber: lmv,
        per100g: food ? { kcal: food.kcal, proteinG: food.protein_g, fatG: food.fat_g, carbsG: food.carbs_g, fiberG: food.fiber_g } : null,
        gramsPerPiece: perPiece,
        gramsPerSlice: perSlice ?? null,
        gramsPerDl: perDl,
        gramsPerPackage: (PACKAGE_GRAMS as Record<string, number>)[name] ?? null,
      };
    }
  }
  // The page's lines (2 portioner) with the names the page itself gives the ingredients.
  const lines: readonly [string, string, number | null, string | null, boolean][] = [
    ["2 majstortillor (à 50 g)", "majstortillor", 2, "st", false],
    ["1 dl pizzasås, tomat", "pizzasås", 1, "dl", false],
    ["½ rödlök", "rödlök", 0.5, "st", false],
    ["100 g körsbärstomater", "körsbärstomater", 100, "g", false],
    ["2 dl riven ost, 17%", "riven ost", 2, "dl", false],
    ["1 dl lätt crème fraiche", "lätt crème fraiche", 1, "dl", false],
    ["½ vitlöksklyfta", "vitlöksklyfta", 0.5, "klyfta", false],
    ["1 dl finhackade färska örter, t ex basilika, timjan, persilja", "färska örter", 1, "dl", false],
    ["salt och peppar", "salt och peppar", null, null, true],
    ["6 skivor rökt kalkon", "rökt kalkon", 6, "skiva", false],
    ["35 g rucola", "rucola", 35, "g", false],
  ];
  const run = (rows: typeof lines, from: Record<string, IngredientNutrition> = table) => {
    const byId: Record<string, IngredientNutrition> = {};
    const input: NutritionLine[] = rows.map(([text, name, amount, unit, isVague], index) => {
      const hit = nameCandidates(normalizeIngredientText(name)).find((candidate) => Object.hasOwn(from, candidate));
      if (hit !== undefined) byId[String(index)] = from[hit];
      return { amount, unit, isVague, ingredientId: String(index), originalText: text, ingredientName: name };
    });
    return recipeNutrition(input, byId, 2);
  };

  it("counts the corn tortillas and the pizza sauce, and the recipe gets its kcal", () => {
    const result = run(lines);
    expect(result.uncounted.filter((line) => line.reason === "unknown_ingredient").map((line) => line.name)).toEqual([]);
    expect(run([lines[0]]).coverage.counted).toBe(1);
    expect(run([lines[0]]).gramsPerServing).toBe(50); // 2 x 50 g for 2 portions
    expect(run([lines[1]]).coverage.counted).toBe(1);
    expect(run([lines[1]]).gramsPerServing).toBe(50); // 100 g for 2 portions
    expect(isTrustworthy(result.coverage)).toBe(true);
    expect(result.perServing.kcal).toBeGreaterThan(300);
  });

  it("was not trustworthy without the two rows: those lines are unknown ingredients", () => {
    const without = Object.fromEntries(Object.entries(table).filter(([name]) => !/^(majstortill|pizzasås)/.test(name)));
    const result = run(lines, without);
    expect(result.uncounted.map((line) => line.name)).toEqual(["majstortillor", "pizzasås"]);
  });
});

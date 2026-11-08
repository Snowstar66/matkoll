import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nameCandidates, type IngredientNutrition, type KostradGroup } from "@/features/nutrition";
import { MAPPING, PACKAGE_GRAMS } from "../../scripts/nutrition-mapping.mjs";

// The nutrition table as the migrations seed it, built from the curated mapping and the committed
// Livsmedelsverket values, for tests that run the domain over realistic recipes without a database.

type Entry = readonly [string[], number | null, string, number | null, number | null, number?];
type Food = { name: string; kcal: number; protein_g: number; fat_g: number; carbs_g: number; fiber_g: number };

const data = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../scripts/nutrition-data/livsmedelsverket.json", import.meta.url)), "utf8"),
) as { foods: Record<string, Food> };

const normalise = (name: string) => name.normalize("NFC").trim().toLocaleLowerCase("sv-SE");

export type NutritionTable = Record<string, IngredientNutrition>;

/** Every mapped name as a row, as the table has it. `packages: false` leaves the package weights out. */
export function buildTable(options: { packages?: boolean } = {}): NutritionTable {
  const packages = options.packages ?? true;
  const table: NutritionTable = {};
  for (const [names, lmv, group, perPiece, perDl, perSlice] of MAPPING as readonly Entry[]) {
    const food = lmv === null ? null : data.foods[lmv];
    for (const raw of names) {
      const name = normalise(raw);
      table[name] = {
        name,
        group: group as KostradGroup,
        lmvNumber: lmv,
        per100g: food ? { kcal: food.kcal, proteinG: food.protein_g, fatG: food.fat_g, carbsG: food.carbs_g, fiberG: food.fiber_g } : null,
        gramsPerPiece: perPiece,
        gramsPerSlice: perSlice ?? null,
        gramsPerDl: perDl,
        gramsPerPackage: packages ? ((PACKAGE_GRAMS as Record<string, number>)[name] ?? null) : null,
      };
    }
  }
  return table;
}

/** The row the app would find for an ingredient name (the first of nameCandidates that the table has), or `null`. */
export function resolveName(table: NutritionTable, name: string, candidates: (name: string) => string[] = nameCandidates): IngredientNutrition | null {
  const hit = candidates(normalise(name)).find((candidate) => Object.hasOwn(table, candidate));
  return hit === undefined ? null : table[hit];
}

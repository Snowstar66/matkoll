import { toGrams } from "./grams";
import { KOSTRAD_GROUPS, type IngredientNutrition, type KostradGroup } from "./groups";

// Nutrition of a recipe per portion, from its lines and the nutrition rows of
// their ingredients. Pure and approximate: only what can be weighed is counted
// and the result says how much that was ("Räknat på 9 av 11 varor").

/** The part of a recipe line the calculation reads (SavedRecipeLine has it). */
export type NutritionLine = {
  amount: number | null;
  /** A catalog unit or `null`; unknown units are skipped, not guessed. */
  unit: string | null;
  isVague: boolean;
  /** The line's catalog ingredient, or `null`. */
  ingredientId: string | null;
};

export type NutritionTotals = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
};

export type Coverage = {
  /** Lines whose grams and values are in the numbers. */
  counted: number;
  /** Lines that could have been counted: all lines except the ones that never count (see below). */
  total: number;
};

/** The three parts of the plate model, in grams per portion. */
export type PlateGrams = { gronsaker: number; kolhydrater: number; protein: number };

export type RecipeNutrition = {
  /** Energy and nutrients per portion, of the counted lines. */
  perServing: NutritionTotals;
  /** Weight of the counted lines per portion. */
  gramsPerServing: number;
  /** Grams per portion by kostrad group. */
  groupGrams: Record<KostradGroup, number>;
  plateGrams: PlateGrams;
  coverage: Coverage;
};

/**
 * Pulses that are eaten as the protein of a meal (tofu, tempeh, soy mince,
 * falafel); on the plate they are protein, other pulses are vegetables.
 * Livsmedelsverket food numbers.
 */
const PROTEIN_PULSES: ReadonlySet<number> = new Set([905, 7027, 6287, 6284]);

/** The part of the plate an ingredient is on, or `null` when it is not on the plate (dairy, fat, sugar, other). */
export function plateRole(nutrition: IngredientNutrition): keyof PlateGrams | null {
  switch (nutrition.group) {
    case "gronsak":
      return "gronsaker";
    case "baljvaxt":
      return nutrition.lmvNumber !== null && PROTEIN_PULSES.has(nutrition.lmvNumber) ? "protein" : "gronsaker";
    case "fullkorn":
    case "raffinerad":
      return "kolhydrater";
    case "fisk":
    case "rott_kott":
    case "fagel":
    case "agg":
      return "protein";
    default:
      return null;
  }
}

const emptyGroups = (): Record<KostradGroup, number> =>
  Object.fromEntries(KOSTRAD_GROUPS.map((group) => [group, 0])) as Record<KostradGroup, number>;

/**
 * Nutrition per portion of a recipe made for `servings` portions.
 *
 * What counts as a line and what is counted:
 * - A line is left out of both numbers of the coverage when its ingredient is
 *   one that never counts (salt, spices, water, stock cubes: group `ej_raknad`),
 *   or when it is vague and has no amount ("olja till stekning", "salt efter
 *   smak"), whatever its ingredient: such a line cannot be weighed, and
 *   it must not drag the coverage down.
 * - Every other line is in `total`. It is `counted` when its ingredient has
 *   nutrition values and its amount and unit give grams (toGrams). A line
 *   without a catalog ingredient, an unknown ingredient, an unknown unit or a
 *   missing density, piece weight or slice weight is not counted.
 * - `servings` that is not a positive number is taken as 1, as scaleFactor does.
 */
export function recipeNutrition(
  lines: readonly NutritionLine[],
  byIngredientId: Readonly<Record<string, IngredientNutrition>>,
  servings: number,
): RecipeNutrition {
  const portions = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const totals: NutritionTotals = { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0 };
  const groupGrams = emptyGroups();
  const plateGrams: PlateGrams = { gronsaker: 0, kolhydrater: 0, protein: 0 };
  let grams = 0;
  let counted = 0;
  let total = 0;

  for (const line of lines) {
    const nutrition = line.ingredientId !== null && Object.hasOwn(byIngredientId, line.ingredientId) ? byIngredientId[line.ingredientId] : null;
    if (nutrition?.group === "ej_raknad") continue;
    if (line.isVague && line.amount === null) continue;
    total++;
    if (!nutrition?.per100g) continue;
    const lineGrams = toGrams(line.amount, line.unit, nutrition);
    if (lineGrams === null) continue;
    counted++;
    const factor = lineGrams / 100;
    totals.kcal += nutrition.per100g.kcal * factor;
    totals.proteinG += nutrition.per100g.proteinG * factor;
    totals.fatG += nutrition.per100g.fatG * factor;
    totals.carbsG += nutrition.per100g.carbsG * factor;
    totals.fiberG += nutrition.per100g.fiberG * factor;
    grams += lineGrams;
    groupGrams[nutrition.group] += lineGrams;
    const role = plateRole(nutrition);
    if (role) plateGrams[role] += lineGrams;
  }

  const perServing: NutritionTotals = {
    kcal: totals.kcal / portions,
    proteinG: totals.proteinG / portions,
    fatG: totals.fatG / portions,
    carbsG: totals.carbsG / portions,
    fiberG: totals.fiberG / portions,
  };
  return {
    perServing,
    gramsPerServing: grams / portions,
    groupGrams: Object.fromEntries(KOSTRAD_GROUPS.map((group) => [group, groupGrams[group] / portions])) as Record<KostradGroup, number>,
    plateGrams: {
      gronsaker: plateGrams.gronsaker / portions,
      kolhydrater: plateGrams.kolhydrater / portions,
      protein: plateGrams.protein / portions,
    },
    coverage: { counted, total },
  };
}

/** Energy rounded to the nearest 10 kcal, for "ca 540 kcal per portion". */
export function roundedKcal(kcal: number): number {
  return Math.round(kcal / 10) * 10;
}

/** Grams of protein, fat, carbohydrate or fibre rounded to a whole gram. */
export function roundedGrams(grams: number): number {
  return Math.round(grams);
}

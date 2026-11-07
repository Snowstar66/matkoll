import type { IngredientNutrition } from "./groups";

// Unit → grams for a recipe line. Approximate by design: a line whose unit
// cannot be turned into grams gives `null` and the caller counts it as not
// counted, never as zero.

/** Millilitres in each volume unit. `hg` is a weight and handled apart. */
const millilitres: Record<string, number> = {
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  msk: 15,
  tsk: 5,
  krm: 1,
};

const gramsPerWeightUnit: Record<string, number> = { g: 1, kg: 1000, hg: 100 };

/** One garlic clove, for "klyfta" of an ingredient with Livsmedelsverket food number 371 (vitlök). */
export const GARLIC_CLOVE_G = 4;
const GARLIC_LMV = 371;

/**
 * The grams in `amount` `unit` of the ingredient, or `null` when it cannot be
 * told:
 * - g, kg, hg: weight.
 * - ml, cl, dl, l, msk (15 ml), tsk (5 ml), krm (1 ml): volume times the
 *   ingredient's grams per dl; `null` without a density.
 * - st, and a line with an amount and no unit ("2 ägg"): amount times grams
 *   per piece; `null` without one.
 * - klyfta: 4 g, for garlic only.
 * - förp, kruka, knippe, skiva and unknown units: `null` (the size is not known).
 */
export function toGrams(amount: number | null, unit: string | null, nutrition: IngredientNutrition): number | null {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  const key = unit === null ? "st" : unit.trim().toLowerCase();
  const weight = gramsPerWeightUnit[key];
  if (weight !== undefined) return amount * weight;
  const volume = millilitres[key];
  if (volume !== undefined) {
    return nutrition.gramsPerDl === null ? null : (amount * volume * nutrition.gramsPerDl) / 100;
  }
  if (key === "st" || key === "styck") return nutrition.gramsPerPiece === null ? null : amount * nutrition.gramsPerPiece;
  if (key === "klyfta") return nutrition.lmvNumber === GARLIC_LMV ? amount * GARLIC_CLOVE_G : null;
  return null;
}

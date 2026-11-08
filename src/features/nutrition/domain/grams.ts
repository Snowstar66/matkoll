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
 * - skiva, skivor: amount times grams per slice; `null` without one.
 * - förp, kruka, knippe: amount times grams per package (one pack, pot or bunch); `null` without one.
 * - unknown units: `null`.
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
  if (key === "skiva" || key === "skivor") return nutrition.gramsPerSlice === null ? null : amount * nutrition.gramsPerSlice;
  if (key === "förp" || key === "kruka" || key === "knippe") {
    return nutrition.gramsPerPackage === null ? null : amount * nutrition.gramsPerPackage;
  }
  if (key === "klyfta") return nutrition.lmvNumber === GARLIC_LMV ? amount * GARLIC_CLOVE_G : null;
  return null;
}

const PROTEIN_GROUPS: ReadonlySet<string> = new Set(["rott_kott", "fagel", "fisk"]);

/**
 * A rough guess of the grams in `amount` `unit` when `toGrams` cannot tell
 * because the ingredient lacks a piece, slice, package or density value.
 * By food group: a slice of meat is about 33 g (12 slices for 4 people is about
 * 100 g each), a slice of bread 30 g, of cheese 10 g; a piece, a package and a
 * dl have a typical weight for the group. `null` for an unknown unit or no amount.
 */
export function estimateGrams(amount: number | null, unit: string | null, nutrition: IngredientNutrition): number | null {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  const key = unit === null ? "st" : unit.trim().toLowerCase();
  const group = nutrition.group;
  const protein = PROTEIN_GROUPS.has(group);
  const bread = group === "fullkorn" || group === "raffinerad";
  if (millilitres[key] !== undefined) return amount * millilitres[key] * 1 /* about 1 g per ml */ ;
  if (key === "skiva" || key === "skivor") return amount * (protein ? 33 : bread ? 30 : group === "mejeri" ? 10 : group === "gronsak" ? 10 : 15);
  if (key === "st" || key === "styck") return amount * (protein ? 150 : bread ? 80 : group === "gronsak" ? 100 : group === "mejeri" ? 100 : group === "agg" ? 55 : 50);
  if (key === "förp") return amount * (protein ? 400 : group === "gronsak" ? 400 : group === "mejeri" ? 200 : bread ? 500 : 250);
  if (key === "kruka" || key === "knippe") return amount * 30;
  if (key === "klyfta") return amount * GARLIC_CLOVE_G;
  return null;
}

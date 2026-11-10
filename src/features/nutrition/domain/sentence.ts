import { isTrustworthy, type RecipeNutrition } from "./recipe-nutrition";
import { GREEN_MIN_G } from "./kostrad";
import { MEAL_REFERENCE } from "./reference";

// One plain, descriptive sentence under the kcal on the nutrition card. Fixed short phrasings picked by
// thresholds (no AI, no judging words, no letters). We have no sugar, saturated fat or salt data, so the
// sentence never says anything about them. Everything is per portion.

/** "Mycket protein": at least this many grams (a good meal reference is 25 g) or this share of the energy. */
export const HIGH_PROTEIN_G = 30;
export const HIGH_PROTEIN_ENERGY = 0.25;
/** "Mycket fett": at least this share of the energy (the usual range is 25-40 %). */
export const HIGH_FAT_ENERGY = 0.45;
/** "Mycket kolhydrater": at least this share of the energy (the usual range is 45-60 %). */
export const HIGH_CARBS_ENERGY = 0.6;
/** "Mest kolhydrater och fett": carbohydrates plus fat are at least this share of the energy. */
export const CARBS_FAT_ONLY_ENERGY = 0.9;
/** "Lite protein" when under this share of the energy. */
export const LOW_PROTEIN_ENERGY = 0.1;
/** Vegetables on the plate: under LOW_VEG_G "lite", none under NO_VEG_G, from GREEN_MIN_G (150 g) "gott om". */
export const NO_VEG_G = 5;
export const LOW_VEG_G = 75;
/** Fibre per portion: under this "lite" (half of the meal reference), from the reference "gott om". */
export const LOW_FIBER_G = MEAL_REFERENCE.fiberG / 2;
/** Below this many kcal per portion the shares are too uncertain to describe. */
export const MIN_KCAL = 100;

/** The lead of the sentence: what the energy is made of; `null` when nothing stands out. */
function leadPhrase(n: RecipeNutrition): string | null {
  const { kcal, proteinG, fatG, carbsG } = n.perServing;
  const pE = (proteinG * 4) / kcal;
  const fE = (fatG * 9) / kcal;
  const cE = (carbsG * 4) / kcal;
  if (fE + cE >= CARBS_FAT_ONLY_ENERGY) return "Mest kolhydrater och fett";
  const high: string[] = [];
  if (proteinG >= HIGH_PROTEIN_G || pE >= HIGH_PROTEIN_ENERGY) high.push("protein");
  if (cE >= HIGH_CARBS_ENERGY) high.push("kolhydrater");
  if (fE >= HIGH_FAT_ENERGY) high.push("fett");
  if (high.length > 0) return `Mycket ${high.join(" och ")}`;
  if (pE < LOW_PROTEIN_ENERGY) return "Lite protein";
  return null;
}

/** What is said about vegetables and fibre; `null` when both are in the middle. */
function plantPhrase(n: RecipeNutrition): string | null {
  const veg = n.plateGrams.gronsaker;
  const fiber = n.perServing.fiberG;
  const vegText = veg < NO_VEG_G ? "inga grönsaker" : veg < LOW_VEG_G ? "lite grönsaker" : veg >= GREEN_MIN_G ? "gott om grönsaker" : null;
  const fiberText = fiber < LOW_FIBER_G ? "lite fibrer" : fiber >= MEAL_REFERENCE.fiberG ? "gott om fibrer" : null;
  if (vegText && fiberText) {
    if (vegText === "lite grönsaker" && fiberText === "lite fibrer") return "lite grönsaker och fibrer";
    if (vegText === "gott om grönsaker" && fiberText === "gott om fibrer") return "gott om grönsaker och fibrer";
    return `${vegText} och ${fiberText}`;
  }
  return vegText ?? fiberText;
}

/**
 * The sentence ("Mycket protein och fett, lite grönsaker och fibrer."), or `null` when the numbers cannot be
 * trusted (isTrustworthy), the dish is under MIN_KCAL, or nothing stands out.
 */
export function nutritionSentence(nutrition: RecipeNutrition): string | null {
  if (!isTrustworthy(nutrition.coverage) || nutrition.perServing.kcal < MIN_KCAL) return null;
  const lead = leadPhrase(nutrition);
  const plants = plantPhrase(nutrition);
  if (lead && plants) return `${lead}, ${plants}.`;
  if (lead) return `${lead}.`;
  if (plants) return `${plants.charAt(0).toUpperCase()}${plants.slice(1)}.`;
  return null;
}

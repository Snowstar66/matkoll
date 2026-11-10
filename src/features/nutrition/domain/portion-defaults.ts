import type { IngredientNutrition } from "./groups";

// A usual portion of an ingredient for a recipe line that has no amount
// ("jasminris" with no grams). Only for known foods that carry a dish and that
// people give per portion: not spices, fat "as needed", sugar, dairy used as a
// sauce or anything else. Approximate by design; the calculation counts the
// line as estimated and says so. The estimate is never written back to the recipe.

/**
 * Grams per person, raw or dry weight. The nutrition rows for rice, pasta,
 * noodles, couscous, bulgur, quinoa and oats are for the UNCOOKED food
 * ("Ris jasmin okokt", "Pasta okokt"), potatoes are raw and dried lentils are
 * dry, so these weights are dry/raw weights and match the rows.
 */
const NAMED: readonly { match: RegExp; grams: number }[] = [
  // Noodles before rice: "risnudlar" is noodles.
  { match: /nudl/, grams: 80 },
  { match: /couscous|bulgur|quinoa/, grams: 70 },
  { match: /\bris\b|basmati|jasmin|arborio/, grams: 75 },
  { match: /pasta|spagh?etti|penne|farfalle|fusilli|makaron|tagliatelle|linguine|fettuccine|rigatoni|tortellini|ravioli/, grams: 90 },
  { match: /gnocchi/, grams: 150 },
  { match: /potatis/, grams: 200 },
  { match: /havre/, grams: 50 },
  { match: /tortilla|wraps?\b|pita/, grams: 60 },
  { match: /bröd|baguette|ciabatta|limpa|toast/, grams: 60 },
];

/** Starches that are not a portion of their own: flour, crumbs, starch, yeast. */
const NOT_A_PORTION = /mjöl|ströbröd|panko|stärkelse|maizena|jäst|bakpulver|mannagryn|knäckebröd/;

/** Vegetables and fruit that flavour rather than carry a dish. */
const FLAVOURING_VEG = /lök|vitlök|chili|ingefära|citron|lime|persilja|dill|koriander|basilika|timjan|rosmarin|mynta|gräslök|oregano|salvia|örter|krydd|puré|soltork|oliv|kapris|pepparrot|senap|saft|skal|apelsin/;

const PROTEIN_PULSE_LMV: ReadonlySet<number> = new Set([905, 7027, 6287, 6284]);

/**
 * Grams (dry or raw weight) of a usual portion per person, or `null` when the
 * ingredient is not one to guess for: fat, sugar, dairy, spices, herbs, onion and
 * garlic, other, anything without nutrition values, flour and crumbs.
 * `name` is the ingredient's name as the line has it; the nutrition row's own
 * name is read too.
 */
export function defaultPortionGrams(nutrition: IngredientNutrition | null, name: string): number | null {
  if (!nutrition?.per100g) return null;
  const text = `${nutrition.name} ${name}`.toLowerCase();
  switch (nutrition.group) {
    case "fisk":
    case "rott_kott":
      return 130;
    case "fagel":
      return 140;
    case "agg":
      return nutrition.gramsPerPiece ?? 55;
    case "baljvaxt":
      if (nutrition.lmvNumber !== null && PROTEIN_PULSE_LMV.has(nutrition.lmvNumber)) return 120;
      // Dried lentils and chickpeas: 60 g dry; canned beans: 100 g drained.
      return /tork|linser/.test(text) ? 60 : 100;
    case "gronsak":
      return FLAVOURING_VEG.test(text) ? null : 100;
    case "fullkorn":
    case "raffinerad":
      if (NOT_A_PORTION.test(text)) return null;
      return NAMED.find((entry) => entry.match.test(text))?.grams ?? null;
    default:
      // mejeri, fett, socker, ovrigt, ej_raknad
      return null;
  }
}

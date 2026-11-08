import { isTrustworthy, type RecipeNutrition } from "./recipe-nutrition";

// What a recipe says about the kostråd: the plate, the tags and the "Nyttigt"
// filter. The limits are rules of thumb built on Livsmedelsverket's advice, are
// per portion and in grams as written in the recipe (raw weight), and are
// constants so they can be tuned without a migration.

/**
 * "Mycket grönt": at least 150 g vegetables, fruit, mushrooms and pulses (not
 * potato, not tofu-type pulses) per portion. The advice is 500 g a day, about a
 * third of it at the dinner; 150 g is a clearly green dish without counting
 * on exact amounts.
 */
export const GREEN_MIN_G = 150;
/** "Fisk": at least 50 g fish or shellfish per portion (half a normal portion; enough to be the fish dish). */
export const FISH_MIN_G = 50;
/** "Baljväxter": at least 50 g pulses (dried, or about twice as much cooked) per portion. */
export const PULSES_MIN_G = 50;
/** "Fullkorn": at least 40 g whole grain per portion, and no less than the refined carbohydrates. */
export const WHOLEGRAIN_MIN_G = 40;
/**
 * The most red meat (beef, pork, lamb, game, charcuterie) per portion for a
 * dish to follow the kostråd: 75 g raw. The advice is at most 500 g cooked
 * (about 700 g raw) red meat a week; one dinner a day would be 100 g, and 75 g
 * leaves room for other meals.
 */
export const RED_MEAT_MAX_G = 75;
/** A "Nyttigt" verdict needs this share of the lines counted, so a recipe we know little about is never called healthy. */
export const FOLLOWS_MIN_COVERAGE = 0.6;
/** The plate is only shown when the three parts weigh at least this much per portion. */
export const PLATE_MIN_G = 100;
/** Most tags shown on a recipe. */
export const MAX_TAGS = 2;

export const KOSTRAD_TAGS = ["Mycket grönt", "Fisk", "Baljväxter", "Fullkorn"] as const;
export type KostradTag = (typeof KOSTRAD_TAGS)[number];

export type PlateShares = { gronsaker: number; kolhydrater: number; protein: number };

/**
 * The shares of grönsaker, kolhydrater and protein by weight, each 0..1 and
 * adding up to 1; `null` when too little is known to draw a plate (less than
 * PLATE_MIN_G counted on the plate) or when the counted lines are not a reliable basis (isTrustworthy). Dairy, fat, sugar and other are not on the plate.
 */
export function plateShares(nutrition: RecipeNutrition): PlateShares | null {
  if (!isTrustworthy(nutrition.coverage)) return null;
  const { gronsaker, kolhydrater, protein } = nutrition.plateGrams;
  const sum = gronsaker + kolhydrater + protein;
  if (sum < PLATE_MIN_G) return null;
  return { gronsaker: gronsaker / sum, kolhydrater: kolhydrater / sum, protein: protein / sum };
}

export type KostradAssessment = {
  /** At most MAX_TAGS tags, the most outstanding first. */
  tags: KostradTag[];
  isFish: boolean;
  isGreen: boolean;
  hasPulses: boolean;
  hasWholegrain: boolean;
  /** Red meat per portion in grams. */
  redMeatG: number;
  /** The "Nyttigt" filter: follows the kostråd (see followsKostrad). */
  follows: boolean;
};

/**
 * Tags, and whether the dish follows the kostråd, for a recipe's nutrition.
 *
 * - A tag is earned when its group reaches its limit (GREEN_MIN_G, FISH_MIN_G,
 *   PULSES_MIN_G, WHOLEGRAIN_MIN_G). The tags only ever say something is
 *   there, so they do not need the recipe to be fully counted.
 * - The tags are ordered by how far each is over its limit (grams ÷ limit),
 *   ties in the order of KOSTRAD_TAGS, and cut to MAX_TAGS.
 * - `follows` ("Nyttigt") is true when the dish is green, fish or pulses,
 *   has at most RED_MEAT_MAX_G red meat per portion, and at least
 *   FOLLOWS_MIN_COVERAGE of its lines were counted. Whole grain alone is
 *   not enough.
 */
export function assessKostrad(nutrition: RecipeNutrition): KostradAssessment {
  const { groupGrams, plateGrams, coverage } = nutrition;
  const green = plateGrams.gronsaker;
  const candidates: { tag: KostradTag; score: number }[] = [
    { tag: "Mycket grönt", score: green / GREEN_MIN_G },
    { tag: "Fisk", score: groupGrams.fisk / FISH_MIN_G },
    { tag: "Baljväxter", score: groupGrams.baljvaxt / PULSES_MIN_G },
    { tag: "Fullkorn", score: groupGrams.fullkorn >= groupGrams.raffinerad ? groupGrams.fullkorn / WHOLEGRAIN_MIN_G : 0 },
  ];
  const earned = candidates.filter((candidate) => candidate.score >= 1);
  const tags = earned
    .map((candidate, index) => ({ ...candidate, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_TAGS)
    .map((candidate) => candidate.tag);

  const isGreen = green >= GREEN_MIN_G;
  const isFish = groupGrams.fisk >= FISH_MIN_G;
  const hasPulses = groupGrams.baljvaxt >= PULSES_MIN_G;
  const hasWholegrain = earned.some((candidate) => candidate.tag === "Fullkorn");
  const redMeatG = groupGrams.rott_kott;
  const enoughCounted = coverage.total > 0 && coverage.counted / coverage.total >= FOLLOWS_MIN_COVERAGE;
  const follows = enoughCounted && (isGreen || isFish || hasPulses) && redMeatG <= RED_MEAT_MAX_G;
  return { tags, isFish, isGreen, hasPulses, hasWholegrain, redMeatG, follows };
}

export type WeekSummary = {
  /** Planned dinners in the list. */
  dinners: number;
  /** Dinners with nutrition that could be assessed. */
  assessed: number;
  fishDishes: number;
  greenDishes: number;
  /** Red meat per person for the week: the sum of each dinner's red meat per portion, in grams. */
  redMeatGramsPerPerson: number;
};

/**
 * The week line ("Veckans middagar: 2 fiskrätter · 3 gröna"): `recipes` is one
 * entry per planned dinner (a recipe planned twice appears twice), `null` for
 * a recipe without nutrition (no counted lines, or nutrition switched off).
 * A dinner is a fish dish when it earns the Fisk tag's limit and green when it
 * reaches GREEN_MIN_G; one dish can be both. Red meat is per person, one
 * portion per dinner.
 */
export function summarizeWeek(recipes: readonly (RecipeNutrition | null)[]): WeekSummary {
  const summary: WeekSummary = { dinners: recipes.length, assessed: 0, fishDishes: 0, greenDishes: 0, redMeatGramsPerPerson: 0 };
  for (const nutrition of recipes) {
    if (nutrition === null || nutrition.coverage.counted === 0) continue;
    const assessment = assessKostrad(nutrition);
    summary.assessed++;
    if (assessment.isFish) summary.fishDishes++;
    if (assessment.isGreen) summary.greenDishes++;
    summary.redMeatGramsPerPerson += assessment.redMeatG;
  }
  return summary;
}

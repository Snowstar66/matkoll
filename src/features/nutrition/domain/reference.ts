// "Riktvärde" for one main meal, used by the bars in the sheet Näring. Descriptive only: no pass/fail.
//
// Source: Nordic Nutrition Recommendations 2023 (NNR2023), as summarised by Livsmedelsverket
// ("Referensvärden för energi och näringsämnen", livsmedelsverket.se/matvanor-halsa--miljo/kostrad/
// naringsrekommendationer/referensvarden-i-nnr/). Adults, intake ranges as share of energy (E%):
//   protein 10-20 E% (15 E% is the planning figure), fat 25-40 E% (planning 32-33), carbohydrates 45-60 E%
//   (planning 52-53), fibre at least 3 g/MJ = 25 g/day for women and 35 g/day for men.
// A main meal is taken as one third of a day at the reference energy 2000 kcal = 667 kcal, so the bars use the
// planning midpoints: protein 15 E% -> 25 g, fat 32.5 E% -> 24 g, carbohydrates 52.5 E% -> 88 g, and fibre 30 g/day
// (midway between 25 and 35) -> 10 g. Docs: docs/naring-riktvarden.md.

/** Energy of a day the references are based on, kcal. */
export const REFERENCE_DAY_KCAL = 2000;
/** A main meal's share of the day. */
export const MEAL_SHARE_OF_DAY = 1 / 3;

export const MEAL_REFERENCE = {
  kcal: Math.round(REFERENCE_DAY_KCAL * MEAL_SHARE_OF_DAY), // 667
  proteinG: 25, // 15 E% of 667 kcal / 4 kcal per g = 25
  fatG: 24, // 32.5 E% / 9 kcal per g = 24
  carbsG: 88, // 52.5 E% / 4 = 88
  fiberG: 10, // 30 g/day / 3
} as const;

/** The bars stop at this share of the reference; a longer bar is full and the percentage tells the real value. */
export const BAR_MAX_SHARE = 1.5;

/** Amount as a share of the meal reference (1 = the reference). */
export function shareOfReference(amount: number, reference: number): number {
  return reference > 0 ? Math.max(0, amount) / reference : 0;
}

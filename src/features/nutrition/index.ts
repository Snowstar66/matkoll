// Client-safe entry: types and domain (AD-1).
export {
  KOSTRAD_GROUPS,
  KOSTRAD_GROUP_LABELS,
  kostradGroupSchema,
  NUTRITION_ATTRIBUTION,
  NUTRITION_LICENSE_URL,
  type IngredientNutrition,
  type KostradGroup,
  type Per100g,
} from "./domain/groups";
export { nameCandidates, compoundHead, COMPOUND_HEADS } from "./domain/names";
export { toGrams, GARLIC_CLOVE_G } from "./domain/grams";
export { isNegligible } from "./domain/negligible";
export { defaultPortionGrams, lengthGrams } from "./domain/portion-defaults";
export {
  recipeNutrition,
  plateRole,
  roundedKcal,
  roundedGrams,
  isTrustworthy,
  TRUST_MIN_COVERAGE,
  TRUST_MAX_UNCOUNTED_WEIGHT,
  type PortionEstimate,
  type UncountedLine,
  type UncountedReason,
  type Coverage,
  type NutritionLine,
  type NutritionTotals,
  type PlateGrams,
  type RecipeNutrition,
} from "./domain/recipe-nutrition";
export {
  assessKostrad,
  plateShares,
  summarizeWeek,
  KOSTRAD_TAGS,
  GREEN_MIN_G,
  FISH_MIN_G,
  PULSES_MIN_G,
  WHOLEGRAIN_MIN_G,
  RED_MEAT_MAX_G,
  FOLLOWS_MIN_COVERAGE,
  PLATE_MIN_G,
  MAX_TAGS,
  type KostradAssessment,
  type KostradTag,
  type PlateShares,
  type WeekSummary,
} from "./domain/kostrad";
export { KOSTRAD_TAG_EXPLANATIONS, PLATE_PARTS, checkCountText, checkMissingText, coverageText, negligibleText, portionEstimatesText, shareText, weekLineText } from "./domain/texts";
export { nutritionCheck, MAX_MISSING_ITEMS, type CheckedRecipe, type MissingItem, type NutritionCheck } from "./domain/coverage";
export { NutritionCard } from "./ui/nutrition-card";
export { NutritionWeekLine, NutritionWeekLineAsync } from "./ui/week-line";
export { useNutritionOptions } from "./ui/use-nutrition-options";

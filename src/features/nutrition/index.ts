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
export { toGrams, GARLIC_CLOVE_G } from "./domain/grams";
export {
  recipeNutrition,
  plateRole,
  roundedKcal,
  roundedGrams,
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
export { KOSTRAD_TAG_EXPLANATIONS, PLATE_PARTS, coverageText, shareText, weekLineText } from "./domain/texts";
export { NutritionCard } from "./ui/nutrition-card";
export { NutritionWeekLine } from "./ui/week-line";
export { useNutritionOptions } from "./ui/use-nutrition-options";

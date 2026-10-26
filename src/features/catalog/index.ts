// Client-safe entry: types and domain (AD-1).
export {
  UNITS,
  COUNT_UNITS,
  isCountUnit,
  unitSchema,
  normalizeUnit,
  parseQuantity,
  formatQuantity,
  displayAmount,
  type Unit,
  type NormalizedUnit,
} from "./domain/units";
export { SECTIONS, sectionSchema, toSection, type Section } from "./domain/sections";
export {
  CATEGORIES,
  categorySchema,
  SAUCE_WORDS,
  displayCategory,
  compareCategories,
  type Category,
} from "./domain/categories";
export { LOCATIONS, locationSchema, toLocation, type Location } from "./domain/locations";
export { cleanIngredientText, normalizeIngredientText } from "./domain/normalize";
export { catalogName, nameInSentence, nameInText, sentenceStart, type NameInText } from "./domain/name";
export {
  ingredientProposalSchema,
  ingredientMatchSchema,
  chosenIngredientSchema,
  ingredientChoiceSchema,
  type IngredientHint,
  type MatchItem,
  type IngredientProposal,
  type IngredientMatch,
  type ChosenIngredient,
  type IngredientChoice,
  type IngredientDefaults,
  type IngredientSummary,
} from "./domain/match";
export {
  ingredientSearchSchema,
  maxSearchHits,
  searchText,
  newIngredientName,
  type IngredientSearchHit,
} from "./domain/search";

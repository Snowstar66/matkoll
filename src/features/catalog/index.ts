// Client-safe entry: types and domain (AD-1).
export {
  UNITS,
  unitSchema,
  normalizeUnit,
  parseQuantity,
  formatQuantity,
  type Unit,
  type NormalizedUnit,
} from "./domain/units";
export { SECTIONS, sectionSchema, toSection, type Section } from "./domain/sections";
export { LOCATIONS, locationSchema, toLocation, type Location } from "./domain/locations";
export { cleanIngredientText, normalizeIngredientText } from "./domain/normalize";
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
} from "./domain/match";

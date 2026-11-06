// Client-safe entry: types and domain (AD-1).
export {
  suggestRequestSchema,
  dishSuggestionsSchema,
  suggestErrorMessage,
  suggestRejectedMessage,
  suggestValidationMessage,
  toAvoidTitles,
  suggestRetryCodes,
  type SuggestRequest,
  type DishSuggestions,
  type DishSuggestion,
} from "./domain/suggestions";
export { toSuggestInput, toOldItemsInput, oldItemsUsed, type SuggestInputShape } from "./domain/pantry-input";
export { toOfferNames, offersUsed, toBuyNames, type OfferInfo } from "./domain/offer-input";
export { offerTagsByRecipe, isMainLine } from "./domain/recipe-offers";
export {
  cookedText,
  dealOf,
  offerSavingKr,
  onWeekIds,
  optionsForTab,
  planMeta,
  planOptions,
  savingPhrase,
  type PlanDeal,
  type PlanOffer,
  type PlanOption,
  type PlanTab,
} from "./domain/plan-options";

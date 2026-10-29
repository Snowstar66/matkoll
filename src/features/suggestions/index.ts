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
export { toSuggestInput, type SuggestInputShape } from "./domain/pantry-input";
export { toOfferNames, offersUsed, atHomeText, toBuyNames, whyText, type OfferInfo } from "./domain/offer-input";

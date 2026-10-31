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
export { toOfferNames, offersUsed, atHomeText, toBuyNames, whyText, type OfferInfo } from "./domain/offer-input";
export { rankOwnRecipes, maxOwnRecipes, type OwnRecipe, type OwnRecipeMatch } from "./domain/own-recipes";

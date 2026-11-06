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
export { nowIdeasResultSchema, nowIdeaSchema, type NowIdeaView, type NowIdeasResultView } from "./domain/now-ideas";
export {
  dropSavedIdeas,
  maxOfferIdeas,
  noOfferIdeas,
  parseSavedIdeas,
  pollSetMs,
  staleSetMs,
  toOfferIdeasView,
  type OfferIdea,
  type OfferIdeasState,
  type OfferIdeasView,
} from "./domain/offer-idea-set";
export { cookNowLists,cookNowNameIds, maxCookNowRecipes, type CookNowRecipe, type CookNowOneMissing, type CookNowLists } from "./domain/cook-now";

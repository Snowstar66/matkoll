import "server-only";

// Server-only entry (AD-1). The suggestions module owns no tables: it reads
// the pantry, the catalog and the recipe format through those modules.

/**
 * AI-förslag from the pantry, the work of an AI job for POST /api/ai/jobs
 * (Story 12.4; not a Server Action), and the check before the job is made.
 */
export { checkSuggestPantry, suggestFromPantry, type SuggestMode } from "./actions/suggest-from-pantry";
export { ownRecipesWithOffers, ownRecipeSuggestions } from "./actions/own-recipes-with-offers";
export { matchOffersWithAi, type MatchOffersWithAiData } from "./actions/match-offers-with-ai";
export { recipeOfferTags } from "./actions/recipe-offer-tags";
export { readCookNow, type CookNowRead } from "./actions/cook-now";

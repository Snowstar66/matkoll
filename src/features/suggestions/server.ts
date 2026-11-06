import "server-only";

// Server-only entry (AD-1). The suggestions module owns one table, offer_idea_set (the saved
// "Nya idéer med extrapris"); for the rest it reads the pantry, the catalog and the recipe format
// through those modules.

/**
 * AI-förslag from the pantry, the work of an AI job for POST /api/ai/jobs
 * (Story 12.4; not a Server Action), and the check before the job is made.
 */
export { checkSuggestPantry, suggestFromPantry, suggestNowIdeas, type SuggestMode } from "./actions/suggest-from-pantry";
export { weekPlanOptions } from "./actions/week-plan-options";
export { matchOffersWithAi, type MatchOffersWithAiData } from "./actions/match-offers-with-ai";
export { recipeOfferTags } from "./actions/recipe-offer-tags";
export { readCookNow, type CookNowRead } from "./actions/cook-now";
// The saved "Nya idéer med extrapris" (table offer_idea_set): the read for the card and Matsedel, and the
// Server Actions that prepare the ideas in the background.
export { loadOfferIdeas, isOfferIdeaError, prepareOfferIdeasNow, type PrepareOutcome } from "./actions/offer-idea-set";
export { prepareOfferIdeas, readOfferIdeas, startOfferIdeas } from "./actions/offer-idea-actions";

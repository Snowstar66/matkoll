import analyzeImagePrompt from "./prompts/analyze-image.md?raw";
import categorizeThingsPrompt from "./prompts/categorize-things.md?raw";
import thingSearchTermsPrompt from "./prompts/thing-search-terms.md?raw";
import askThingsPrompt from "./prompts/ask-things.md?raw";
import listThingsPrompt from "./prompts/list-things.md?raw";
import matchOffersPrompt from "./prompts/match-offers.md?raw";
import mergeThingsPrompt from "./prompts/merge-things.md?raw";
import locateThingPrompt from "./prompts/locate-thing.md?raw";
import parseRecipePrompt from "./prompts/parse-recipe.md?raw";
import suggestDishesPrompt from "./prompts/suggest-dishes.md?raw";
import suggestDishesNowPrompt from "./prompts/suggest-dishes-now.md?raw";
import suggestDishesFriendPrompt from "./prompts/suggest-dishes-friend.md?raw";
import readShoppingListPrompt from "./prompts/read-shopping-list.md?raw";
import nowIdeasPrompt from "./prompts/now-ideas.md?raw";

// System prompts for the AI port, kept as files in prompts/ (AD-9). They are
// imported as strings, so they are part of the server bundle after `next build`
// instead of being read from disk at runtime.
export const prompts = {
  parseRecipe: parseRecipePrompt,
  suggestDishes: suggestDishesPrompt,
  suggestDishesNow: suggestDishesNowPrompt,
  suggestDishesFriend: suggestDishesFriendPrompt,
  nowIdeas: nowIdeasPrompt,
  analyzeImage: analyzeImagePrompt,
  locateThing: locateThingPrompt,
  listThings: listThingsPrompt,
  askThings: askThingsPrompt,
  mergeThings: mergeThingsPrompt,
  matchOffers: matchOffersPrompt,
  categorizeThings: categorizeThingsPrompt,
  thingSearchTerms: thingSearchTermsPrompt,
  readShoppingList: readShoppingListPrompt,
} as const;

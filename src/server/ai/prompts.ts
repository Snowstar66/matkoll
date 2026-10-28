import analyzeImagePrompt from "./prompts/analyze-image.md?raw";
import locateItemsPrompt from "./prompts/locate-items.md?raw";
import parseRecipePrompt from "./prompts/parse-recipe.md?raw";
import suggestDishesPrompt from "./prompts/suggest-dishes.md?raw";

// System prompts for the AI port, kept as files in prompts/ (AD-9). They are
// imported as strings, so they are part of the server bundle after `next build`
// instead of being read from disk at runtime.
export const prompts = {
  parseRecipe: parseRecipePrompt,
  suggestDishes: suggestDishesPrompt,
  // Story 12.7: the answer is streamed as an array, which the AI SDK asks for as { "elements": [ … ] }.
  suggestDishesStream: suggestDishesPrompt.replace('{ "suggestions": [ … ] }', '{ "elements": [ … ] }'),
  analyzeImage: analyzeImagePrompt,
  locateItems: locateItemsPrompt,
} as const;

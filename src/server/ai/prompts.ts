import analyzeImagePrompt from "./prompts/analyze-image.md?raw";
import listThingsPrompt from "./prompts/list-things.md?raw";
import locateItemsPrompt from "./prompts/locate-items.md?raw";
import parseRecipePrompt from "./prompts/parse-recipe.md?raw";
import suggestDishesPrompt from "./prompts/suggest-dishes.md?raw";

// System prompts for the AI port, kept as files in prompts/ (AD-9). They are
// imported as strings, so they are part of the server bundle after `next build`
// instead of being read from disk at runtime.
export const prompts = {
  parseRecipe: parseRecipePrompt,
  suggestDishes: suggestDishesPrompt,
  analyzeImage: analyzeImagePrompt,
  locateItems: locateItemsPrompt,
  listThings: listThingsPrompt,
} as const;

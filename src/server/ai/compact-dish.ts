import type { AiRecipe, CompactDish } from "./schemas";

// Story 12.3 (AD-10): suggestDishes asks the model for the shorter answer in
// compactDish, and the port turns each dish into the AiRecipe that parseRecipe
// returns too, so fromAiRecipe, the preview and saving stay as they are.

/** The catalog entry of a line without `new`: an item from the pantry, already in the catalog and matched on its name. */
export const pantryHintDefaults = { section: "Övrigt", location: "Skafferi", defaultUnit: "st" } as const;

/**
 * A compact dish as an AiRecipe: `originalText` is `text`, a line without an
 * amount is vague (and so has no unit either, as aiRecipeIngredient asks),
 * and the hint is `name` with the catalog entry in `new`, or, for an item
 * from the pantry, Övrigt, Skafferi and the line's unit or `st`.
 */
export function fromCompactDish(dish: CompactDish): AiRecipe {
  return {
    title: dish.title,
    servings: dish.servings,
    totalMinutes: dish.totalMinutes,
    ingredients: dish.ingredients.map((line) => {
      const isVague = line.amount === null;
      return {
        originalText: line.text,
        amount: line.amount,
        unit: isVague ? null : line.unit,
        isVague,
        hint: {
          name: line.name,
          section: line.new?.section ?? pantryHintDefaults.section,
          location: line.new?.location ?? pantryHintDefaults.location,
          defaultUnit: line.new?.defaultUnit ?? line.unit ?? pantryHintDefaults.defaultUnit,
        },
        stepIndexes: [...line.stepIndexes],
      };
    }),
    steps: [...dish.steps],
  };
}

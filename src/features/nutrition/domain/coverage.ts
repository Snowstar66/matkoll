import { isTrustworthy, recipeNutrition, type NutritionLine } from "./recipe-nutrition";
import type { IngredientNutrition } from "./groups";

// Näringskoll: how many of a household's recipes the nutrition can be counted for, and what is missing
// most often. The gate is the recipe card's own (isTrustworthy), so the number is what the cards show.

/** A recipe as the check reads it. */
export type CheckedRecipe = { lines: readonly NutritionLine[]; servings: number };

/** One ingredient (and the unit, when the unit is why it is not counted) that keeps recipes from being counted. */
export type MissingItem = {
  name: string;
  /** The unit when the ingredient is known but the size of the unit is not ("förp"); `null` when the ingredient is unknown. */
  unit: string | null;
  /** How many of the recipes that cannot be counted have it. */
  recipes: number;
};

export type NutritionCheck = {
  /** All recipes looked at. */
  total: number;
  /** The recipes the nutrition can be counted for (trustworthy numbers). */
  counted: number;
  /** The most common missing items, most recipes first. */
  missing: MissingItem[];
};

/** How many missing items the check names. */
export const MAX_MISSING_ITEMS = 5;

/**
 * The check over `recipes`, with `byIngredientId` the nutrition rows of their ingredients (as recipeNutrition
 * reads them). A recipe counts when its numbers pass the card's gate. The missing items are the uncounted
 * lines of the recipes that do not pass, by ingredient name (and by unit when the unit is the reason), in
 * the order of how many recipes have them; lines without a catalog ingredient are not named.
 */
export function nutritionCheck(
  recipes: readonly CheckedRecipe[],
  byIngredientId: Readonly<Record<string, IngredientNutrition>>,
): NutritionCheck {
  let counted = 0;
  const blocking = new Map<string, MissingItem>();
  for (const recipe of recipes) {
    const result = recipeNutrition(recipe.lines, byIngredientId, recipe.servings);
    if (isTrustworthy(result.coverage)) {
      counted++;
      continue;
    }
    const seen = new Set<string>();
    for (const line of result.uncounted) {
      if (line.name === null) continue;
      const unit = line.reason === "unknown_unit" ? (line.unit ?? "st") : null;
      const key = `${line.name}\u0000${unit ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = blocking.get(key) ?? { name: line.name, unit, recipes: 0 };
      item.recipes++;
      blocking.set(key, item);
    }
  }
  const missing = [...blocking.values()]
    .sort((a, b) => b.recipes - a.recipes || a.name.localeCompare(b.name, "sv-SE"))
    .slice(0, MAX_MISSING_ITEMS);
  return { total: recipes.length, counted, missing };
}

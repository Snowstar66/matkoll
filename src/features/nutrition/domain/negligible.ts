import type { IngredientNutrition } from "./groups";

// Ingredients that are negligible by nature: a thumb of ginger, a clove of garlic,
// herbs, a dash of soy. When such a line cannot be counted (no amount, a unit that
// cannot be weighed) it is left out of the coverage, like salt, so it never blocks
// kcal and nutrition. With an amount that can be weighed it is counted as any line.
// Onions are NOT here: they weigh.

const NEGLIGIBLE =
  /ingefära|vitlök|chili|citron|lime\b|persilja|dill|koriander|basilika|timjan|rosmarin|mynta|gräslök|oregano|salvia|örter|krydd|buljong|fond\b|senap|\bsoja\b|sojasås|tamari|fisksås|ostronsås|worcester|tabasco|sriracha|tomatpur|kapris|\boliver\b|pepparrot|saffran|vanilj|lagerblad/;

/** Whether the ingredient is one that is negligible when it cannot be weighed. `name` is the line's ingredient name. */
export function isNegligible(nutrition: IngredientNutrition | null, name: string): boolean {
  return NEGLIGIBLE.test(`${nutrition?.name ?? ""} ${name}`.toLowerCase());
}

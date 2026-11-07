// Story 16.4: the illustration of a recipe without a photo. The emoji rules live in
// src/lib/dish-emoji.ts, since RecipeImage (shared) needs them too (UX-13).
export { defaultDishEmoji, dishEmoji } from "@/lib/dish-emoji";

/** The sentence under the title of a recipe saved from the offers, or `null` for any other recipe. */
export function offerSavedText(offerNames: readonly string[] | undefined): string | null {
  const names = (offerNames ?? []).filter((name) => name.trim() !== "");
  return names.length > 0 ? `Sparad från veckans erbjudanden: ${names.join(", ")}` : null;
}

// Stryk ingrediens: a recipe line the household has struck stays in the recipe but is left out of every count
// (pantry status, shopping list, "Saknas", nutrition, preference notes). Pure, so it is tested without a database.

/** The part of a recipe line the strike reads. */
export type StrikableLine = { isStruck?: boolean };

/** The lines that count: the struck ones left out, in the same order. */
export function withoutStruck<T extends StrikableLine>(lines: readonly T[]): T[] {
  return lines.filter((line) => !line.isStruck);
}

/** What the preference notes (menu-advisor.foodFit) read of a recipe: its title and its lines' text, the struck lines left out. */
export function recipeFitInput(recipe: { title: string; lines: readonly (StrikableLine & { originalText: string })[] }): {
  name: string;
  ingredients: string[];
} {
  return { name: recipe.title, ingredients: withoutStruck(recipe.lines).map((line) => line.originalText) };
}

/** "1 ingrediens struken", "2 ingredienser strukna"; `null` when nothing is struck. */
export function struckSummaryText(lines: readonly StrikableLine[]): string | null {
  const count = lines.filter((line) => line.isStruck).length;
  if (count === 0) return null;
  return count === 1 ? "1 ingrediens struken" : `${count} ingredienser strukna`;
}

function words(text: string): string[] {
  return text.toLocaleLowerCase("sv").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * The warning under a step that mentions a struck ingredient: "Nämner koriander, som du har strukit.", or `null`.
 * A plain word comparison: every word of the ingredient's name must start some word of the step ("koriander"
 * matches "koriandern"). A struck line without a catalog name never matches. The step's text is not changed.
 */
export function struckStepWarning(stepText: string, struckNames: readonly string[]): string | null {
  const stepWords = words(stepText);
  const named = struckNames.filter((name) => {
    const nameWords = words(name);
    return nameWords.length > 0 && nameWords.every((word) => stepWords.some((stepWord) => stepWord.startsWith(word)));
  });
  if (named.length === 0) return null;
  const list = named.map((name) => name.toLocaleLowerCase("sv"));
  const text = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} och ${list[list.length - 1]}`;
  return `Nämner ${text}, som du har strukit.`;
}

/**
 * The amount to store for what was typed in "Ändra mängd" for the servings shown: "1,5" at factor 2 is 0.75 for the
 * recipe's own servings, rounded to four decimals. `null` when it is not a positive number.
 */
export function amountForRecipe(typed: string, factor: number): number | null {
  const value = Number(typed.trim().replace(",", "."));
  if (!typed.trim() || !Number.isFinite(value) || value <= 0 || !Number.isFinite(factor) || factor <= 0) return null;
  const stored = Math.round((value / factor) * 10000) / 10000;
  return stored > 0 ? stored : null;
}

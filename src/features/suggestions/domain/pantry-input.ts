import { displayAmount } from "@/features/catalog";
import type { PantrySnapshot } from "@/features/pantry";
import {
  cleanModelText,
  cutCodePoints,
  isValidPantryEntry,
  pantryLine,
  suggestInputLimits,
  type SuggestPantryEntry,
} from "@/lib/suggest-input";

// What the AI port's suggestDishes gets of the pantry (FR-23, AD-9): one entry
// per catalog ingredient and unit, by name, never ids, locations or dates.
// Pure, so it is tested without a database. The limits, the checks and the
// line format are shared with the port (src/lib/suggest-input.ts), so what
// is sent always passes there.

/**
 * The shape of the AI port's SuggestDishesInput (src/server/ai/service.ts).
 * Declared here because domain code never imports the port (AD-1); this fits it.
 */
export type SuggestInputShape = { pantry: SuggestPantryEntry[]; avoidTitles: string[]; offers?: string[] };

/** The smallest amount sent: what is shown with two decimals, never 0. */
const minAmount = 0.01;

/**
 * The pantry as suggestDishes takes it, and how many entries were left out to
 * stay within the limits:
 *
 * - one entry per ingredient and unit with the amount from the snapshot,
 *   rounded as it is shown (displayAmount, at least 0,01); an ingredient that
 *   is always enough is one entry with `amount: null, unit: null`;
 * - names and units cleaned of control and format characters with
 *   whitespace collapsed (cleanModelText), names cut to 100 code points;
 * - an ingredient without a name, and an entry the port would refuse, is skipped;
 * - by name in Swedish order (localeCompare "sv"), units in the snapshot's order;
 * - the first entries in that order are kept, as many as fit within the
 *   limits; the rest are counted in `dropped`.
 */
export function toSuggestInput(
  snapshot: PantrySnapshot,
  names: Readonly<Record<string, string>>,
  avoidTitles: readonly string[],
): { input: SuggestInputShape; dropped: number } {
  const ingredients: { name: string; entries: SuggestPantryEntry[] }[] = [];
  for (const [id, stock] of snapshot) {
    const name = cutCodePoints(cleanModelText(names[id] ?? ""), suggestInputLimits.maxNameChars).trim();
    if (!name) continue;
    const entries: SuggestPantryEntry[] = stock.unlimited
      ? [{ name, amount: null, unit: null }]
      : stock.amounts.map(({ amount, unit }) => ({
          name,
          amount: Number.isFinite(amount) && amount > 0 ? Math.max(minAmount, displayAmount(amount)) : amount,
          unit: cleanModelText(unit) || null,
        }));
    ingredients.push({ name, entries: entries.filter(isValidPantryEntry) });
  }
  const all = ingredients.sort((a, b) => a.name.localeCompare(b.name, "sv")).flatMap(({ entries }) => entries);

  const pantry: SuggestPantryEntry[] = [];
  // Each line, and a line break between them (pantryLinesLength).
  let chars = 0;
  for (const entry of all) {
    const next = chars + pantryLine(entry).length + (pantry.length > 0 ? 1 : 0);
    if (pantry.length >= suggestInputLimits.maxPantryItems || next > suggestInputLimits.maxPantryChars) break;
    pantry.push(entry);
    chars = next;
  }
  return { input: { pantry, avoidTitles: [...avoidTitles] }, dropped: all.length - pantry.length };
}

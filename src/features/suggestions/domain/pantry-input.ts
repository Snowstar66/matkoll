import { displayAmount } from "@/features/catalog";
import type { OldPantryItem, PantrySnapshot } from "@/features/pantry";
import {
  cleanModelText,
  cutCodePoints,
  isValidOldItem,
  isValidPantryEntry,
  pantryLine,
  suggestInputLimits,
  type SuggestOldItem,
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
export type SuggestInputShape = {
  pantry: SuggestPantryEntry[];
  avoidTitles: string[];
  offers?: string[];
  oldItems?: SuggestOldItem[];
  eatFirst?: boolean;
};

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

/**
 * The old items as suggestDishes takes them (Story 16.13): names cleaned and
 * cut like the pantry's, each name once (its oldest age, as given oldest
 * first), the ones the port would refuse skipped, and at most
 * `maxOldItems` of the oldest kept, so the payload stays small. Names and
 * days only, never ids, locations or dates.
 */
export function toOldItemsInput(old: readonly OldPantryItem[]): SuggestOldItem[] {
  const seen = new Set<string>();
  const kept: SuggestOldItem[] = [];
  for (const { name, days } of old) {
    const clean = cutCodePoints(cleanModelText(name), suggestInputLimits.maxNameChars).trim();
    const item = { name: clean, days };
    if (seen.has(clean) || !isValidOldItem(item)) continue;
    seen.add(clean);
    kept.push(item);
    if (kept.length === suggestInputLimits.maxOldItems) break;
  }
  return kept;
}

/**
 * The old items a dish uses (Story 16.13), for its reason line: those whose
 * ingredient the dish is linked to, in the order given (oldest first).
 */
export function oldItemsUsed(old: readonly OldPantryItem[], linkedIds: ReadonlySet<string>): { name: string; days: number }[] {
  return old.filter((item) => linkedIds.has(item.ingredientId)).map(({ name, days }) => ({ name, days }));
}

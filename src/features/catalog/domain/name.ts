import { normalizeIngredientText } from "./normalize";

// A catalog ingredient's display name (Story 10.4). The name is stored with
// an uppercase first letter, whatever source it comes from ("bregott" →
// "Bregott", "ägg" → "Ägg"); the rest is kept as written. Only `name`
// changes: normalized_name, matching and search stay lower case
// (normalizeIngredientText, AD-6).
//
// The same rule is the SQL function public.catalog_display_name(text)
// (migration catalog_name_rule), which a trigger applies to every insert and
// change of ingredient.name; tests/integration/catalog.test.ts runs both on
// the same cases (catalogNameCases).

const letter = /\p{L}/u;
const letterOrDigit = /[\p{L}\p{Nd}]/u;
const space = /\s/u;

const upper = (text: string) => text.toLocaleUpperCase("sv-SE");
const lower = (text: string) => text.toLocaleLowerCase("sv-SE");
/** A letter with a lower-case form different from itself: an upper-case or title-case letter. */
const isCapital = (char: string) => lower(char) !== char;

/** The index of the first letter, or -1 when the text has none or starts with a digit ("7up"). */
function firstLetter(chars: readonly string[]): number {
  const index = chars.findIndex((char) => letterOrDigit.test(char));
  return index >= 0 && letter.test(chars[index]) ? index : -1;
}

/** The word the letter at `index` starts, up to the next space. */
function wordAt(chars: readonly string[], index: number): string[] {
  const rest = chars.slice(index);
  const end = rest.findIndex((char) => space.test(char));
  return end < 0 ? rest : rest.slice(0, end);
}

/** The text with its first letter in upper case, unless its first word is mixed case or the letter has no one-letter capital. */
function capitalized(text: string): string {
  const chars = [...text];
  const index = firstLetter(chars);
  if (index < 0) return text;
  const capital = upper(chars[index]);
  if ([...capital].length !== 1 || capital === chars[index]) return text;
  const second = wordAt(chars, index)
    .slice(1)
    .find((char) => letter.test(char));
  if (second !== undefined && isCapital(second)) return text;
  return [...chars.slice(0, index), capital, ...chars.slice(index + 1)].join("");
}

/**
 * The name as the catalog stores it, trimmed and with its first letter in
 * upper case:
 * - the first letter (`\p{L}`), after any leading quotes, brackets or emoji:
 *   "(eko) mjölk" → "(Eko) mjölk". A name that starts with a digit ("7up")
 *   or has no letter is kept;
 * - a first word that is already mixed case ("iPhone-laddare", "pH-neutral")
 *   is kept;
 * - only that letter changes, never the marks after it or the rest, and the
 *   name is not normalised;
 * - a letter without a one-letter capital ("ß"), or whose capital would
 *   change the normalised name ("ı", "ſ"), is kept.
 */
export function catalogName(name: string): string {
  const value = name.trim();
  const result = capitalized(value);
  return normalizeIngredientText(result) === normalizeIngredientText(value) ? result : value;
}

/**
 * A catalog name inside a sentence or a running list, after other words:
 * "Det gick inte att ångra mjölk.", "Med: gul lök, grädde". The first letter
 * is made lower case, except when the first word is written in its own way:
 * - mixed case or capitals ("Coca-Cola", "McCain", "ICA-korv", "ICA:s");
 * - one letter before a hyphen ("D-vitamin", "A-fil", "K-märkt").
 * Only for catalog names: the user's own items and recipe text are shown as
 * written.
 */
export function nameInSentence(name: string): string {
  const chars = [...name];
  const index = chars.findIndex((char) => letter.test(char));
  if (index < 0) return name;
  const word = wordAt(chars, index);
  if (word.slice(1).some((char) => letter.test(char) && isCapital(char))) return name;
  if (word[1] === "-") return name;
  const small = lower(chars[index]);
  if ([...small].length !== 1) return name;
  return [...chars.slice(0, index), small, ...chars.slice(index + 1)].join("");
}

/**
 * A name that starts a sentence, with its first letter in upper case:
 * "diskmedel" in "Tog bort Diskmedel.". A mixed-case first word
 * ("iPhone-laddare") is kept.
 */
export function sentenceStart(text: string): string {
  return capitalized(text);
}

/** A name in a text: a catalog name, or `{ text, own: true }` for the user's own item or a recipe line's text, shown as written. */
export type NameInText = string | { text: string; own: true };

/**
 * The name where it stands in a sentence: at the start with its first letter
 * in upper case (sentenceStart), inside with a catalog name in lower case
 * (nameInSentence) and own text as written.
 */
export function nameInText(name: NameInText, at: "start" | "inside"): string {
  const text = typeof name === "string" ? name : name.text;
  if (at === "start") return sentenceStart(text);
  return typeof name === "string" ? nameInSentence(text) : text;
}

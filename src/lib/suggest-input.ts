// What AI-förslag send to the model, shared by the suggestions module (which
// builds it) and the AI port (which checks and sends it), so both count and
// check the same thing (AD-1, AD-9). Pure: no I/O, no features.

/** One pantry entry: a catalog name with an amount and unit, or both `null` when the item is always enough. */
export type SuggestPantryEntry = { name: string; amount: number | null; unit: string | null };

/**
 * Limits for suggestDishes, sized for Qwen3.6 in LM Studio with an 8 192-token
 * context: the pantry as at most 4 000 characters of lines (about 1 300
 * tokens), and three answers of at most about 1 000 tokens each.
 */
export const suggestInputLimits = {
  maxPantryItems: 120,
  /** In code points. */
  maxNameChars: 100,
  maxUnitChars: 20,
  /** Largest amount; larger is not a pantry amount (and would print with an exponent). */
  maxAmount: 1_000_000,
  /** The pantry's lines, as pantryLines writes them. */
  maxPantryChars: 4_000,
  maxAvoidTitles: 3,
  maxTitleChars: 200,
  /** Offer names sent with "Föreslå rätter från veckans erbjudanden" (Story 9.5). */
  maxOffers: 40,
  /** The offers' lines, as offerLines writes them. */
  maxOfferChars: 1_000,
} as const;

/** Control and format characters, and the line and paragraph separators. */
const controlChars = /[\p{Cc}\u2028\u2029]/gu;
const formatChars = /\p{Cf}/gu;

/**
 * Text as it may reach the model: control characters become spaces, format
 * characters (zero-width and direction marks) are removed, whitespace is one
 * space, and the ends are trimmed.
 */
export function cleanModelText(text: string): string {
  return text.replace(controlChars, " ").replace(formatChars, "").replace(/\s+/g, " ").trim();
}

/** True when the text has a control character or a line or paragraph separator. */
export function hasControlChars(text: string): boolean {
  return /[\p{Cc}\u2028\u2029]/u.test(text);
}

/** At most `max` code points, so a character is never cut in half. */
export function cutCodePoints(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, max).join("");
}

/** The length in code points. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** An amount as plain decimal text, at most two decimals and never with an exponent: 1.5 → "1.5", 600 → "600". */
export function plainAmount(amount: number): string {
  return amount.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * One pantry line as the model reads it: "gul lök: 3 st", "mjölk: 1,5 l"
 * (Swedish decimal comma), "ägg: 6", or "salt: finns" for an item that is
 * always enough. Names and units are clean (isValidPantryEntry), so a line
 * never holds a line break.
 */
export function pantryLine({ name, amount, unit }: SuggestPantryEntry): string {
  if (amount === null) return `${name}: finns`;
  const number = plainAmount(amount).replace(".", ",");
  return unit ? `${name}: ${number} ${unit}` : `${name}: ${number}`;
}

/** The pantry as lines, one per entry. */
export function pantryLines(entries: readonly SuggestPantryEntry[]): string {
  return entries.map(pantryLine).join("\n");
}

/** The length pantryLines gives for `entries`, entry by entry: each line, and a line break between them. */
export function pantryLinesLength(entries: readonly SuggestPantryEntry[]): number {
  return entries.reduce((sum, entry, index) => sum + pantryLine(entry).length + (index > 0 ? 1 : 0), 0);
}

/** The titles to avoid as lines: "- Pannkakor". Titles are clean (no line breaks), so each is one line. */
export function avoidTitleLines(titles: readonly string[]): string {
  return titles.map((title) => `- ${title}`).join("\n");
}

/**
 * True for an entry the port takes: a clean name of 1–100 code points, and
 * either no amount and no unit, or a finite amount above 0 (at most
 * maxAmount) with a clean unit of at most 20 characters or none.
 */
export function isValidPantryEntry({ name, amount, unit }: SuggestPantryEntry): boolean {
  const limits = suggestInputLimits;
  if (!name || name !== cleanModelText(name) || codePointLength(name) > limits.maxNameChars) return false;
  if (amount === null) return unit === null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > limits.maxAmount) return false;
  // What reaches the model has two decimals at most, and must not read as 0.
  if (plainAmount(amount) === "0") return false;
  return unit === null || (unit !== "" && unit === cleanModelText(unit) && unit.length <= limits.maxUnitChars);
}

/** A title for comparing: whitespace collapsed, trimmed, lower case. "Fisk  Gratäng " and "fiskgratäng" differ; "Fisk gratäng" does not. */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
}

/** The offers' names as lines: "- falukorv". Names are clean (isValidOfferName), so each is one line. */
export function offerLines(names: readonly string[]): string {
  return names.map((name) => `- ${name}`).join("\n");
}

/** The length offerLines gives for `names`: each line, and a line break between them. */
export function offerLinesLength(names: readonly string[]): number {
  return names.reduce((sum, name, index) => sum + name.length + 2 + (index > 0 ? 1 : 0), 0);
}

/** True for an offer name the port takes: clean, 1–100 code points. */
export function isValidOfferName(name: string): boolean {
  return name !== "" && name === cleanModelText(name) && codePointLength(name) <= suggestInputLimits.maxNameChars;
}

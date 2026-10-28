// Text Pontus types that is later written line by line (the basket export,
// Story 7.3): a store's name, id and address (Story 7.1) and a product
// choice (Story 7.2). The tables' checks refuse what these leave out
// (supabase/migrations/*_shopping_product_choice_hardening.sql), so a stored
// text never breaks a line. Pure.

/**
 * The code point ranges, inclusive, that a stored one-line text never holds
 * and the tables' checks refuse: control characters (U+0001–U+001F,
 * U+007F–U+009F), the Arabic letter mark (U+061C), zero-width characters and
 * the left-to-right and right-to-left marks (U+200B–U+200F), the line and
 * paragraph separators (U+2028, U+2029), the bidi controls (U+202A–U+202E,
 * U+2066–U+2069) and the zero-width no-break space (U+FEFF).
 */
export const refusedCodePoints: readonly (readonly [number, number])[] = [
  [0x0001, 0x001f],
  [0x007f, 0x009f],
  [0x061c, 0x061c],
  [0x200b, 0x200f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

/** Invisible marks that oneLine removes: they would make a line read in another order, or look empty. */
const invisibleMarks = /[\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
/** What the tables' checks refuse in a text: every range in refusedCodePoints. */
const refusedInText = /[\u0001-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/;

/** Whether the text holds a character the tables' one-line checks refuse (refusedCodePoints). */
export function hasRefusedCodePoint(text: string): boolean {
  return refusedInText.test(text);
}

/** The text's length in characters (code points), as Postgres's char_length counts it. */
export function charLength(text: string): number {
  return [...text].length;
}

/**
 * A one-line text as typed: zero-width and bidi marks are removed, control
 * characters, line and paragraph separators and runs of whitespace become
 * one space, and the ends are trimmed. A text of nothing but invisible
 * characters is empty.
 */
export function oneLine(text: string): string {
  return text
    .replace(invisibleMarks, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * An https address as stored: trimmed, with "https://" in lower case. `null`
 * when it is not an https address with a host right after the scheme, or has
 * whitespace or a refused character in it. Only checked, never fetched.
 */
export function normalizeHttpsUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!/^https:\/\//i.test(trimmed) || /\s/.test(trimmed) || refusedInText.test(trimmed)) return null;
  const url = `https://${trimmed.slice("https://".length)}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname) return null;
  } catch {
    return null;
  }
  // A host right after the scheme, as the tables' url checks require.
  return /^https:\/\/[^/?#]/.test(url) ? url : null;
}

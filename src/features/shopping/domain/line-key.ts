import { z } from "zod";
import { searchText, UNITS, type Unit } from "@/features/catalog";

// The shopping list's line keys (AD-8): the only place a key is built or
// read. A key says which line a check, a corrected amount or a hidden line
// (Stories 3.4–3.6) belongs to, so it never holds the line's coverage: a line
// keeps its key when the pantry changes from missing to partial. Pure, so it
// is tested without a database.
//
// - `r:<ingredientId>:<unit>`: what the recipes need of a catalog ingredient
//   in one unit; an amount without unit is `st` (decision 2026-10-26).
// - `r:<ingredientId>:-`: a vague line ("salt efter smak"); `-` means nothing else.
// - `t:<normalised text>`: a recipe line without a catalog ingredient, by its
//   written text in lower case with single spaces (decision 2026-10-26).
// - `c:<shopping_custom_item.id>`: an item Pontus adds to the list (Story 3.5).

/** What a key stands for. */
export type ParsedLineKey =
  | { kind: "recipe"; ingredientId: string; unit: Unit }
  | { kind: "vague"; ingredientId: string }
  | { kind: "text"; text: string }
  | { kind: "custom"; id: string };

/** The `-` that marks a vague line; never a unit. */
const vagueMark = "-";

/** At most this long: `t:` and a recipe line's text (300 characters, draftLimits). */
export const maxLineKeyChars = 302;

const textPrefix = "t:";
const maxTextChars = maxLineKeyChars - textPrefix.length;

const idSchema = z.guid();
const units: ReadonlySet<string> = new Set(UNITS);

/** The key of what the recipes need of `ingredientId` in `unit`; `null` is a vague line. */
export function recipeLineKey(ingredientId: string, unit: Unit | null): string {
  return `r:${ingredientId}:${unit ?? vagueMark}`;
}

/** Lower case, single spaces, trimmed, composed letters (also after lower-casing, "İ" → "i̇"). */
const normalizeText = (text: string) => searchText(text).normalize("NFC");

/** At most maxTextChars UTF-16 units, cut between code points, without trailing spaces. */
function truncate(text: string): string {
  if (text.length <= maxTextChars) return text;
  let kept = "";
  for (const char of text) {
    if (kept.length + char.length > maxTextChars) break;
    kept += char;
  }
  return kept.trimEnd();
}

/**
 * The text a recipe line without a catalog ingredient is merged by: lower
 * case, single spaces, trimmed, and cut so the key fits maxLineKeyChars.
 * Applying it again changes nothing, so parseLineKey reads every key
 * textLineKey builds.
 */
export function lineText(originalText: string): string {
  let text = truncate(normalizeText(originalText));
  // Normalising a cut text could in theory change it again; stop at the fixed point.
  for (let round = 0; round < 4; round += 1) {
    const again = truncate(normalizeText(text));
    if (again === text) break;
    text = again;
  }
  return text;
}

/** The key of a recipe line without a catalog ingredient; the same text from several dishes is one line. */
export function textLineKey(originalText: string): string {
  return `${textPrefix}${lineText(originalText)}`;
}

/** The key of an item Pontus added to the list (egen vara). */
export function customLineKey(id: string): string {
  return `c:${id}`;
}

/** What `key` stands for, or `null` when it is not a key these functions build. */
export function parseLineKey(key: string): ParsedLineKey | null {
  if (key.length > maxLineKeyChars) return null;
  const kind = key.slice(0, 2);
  const rest = key.slice(2);
  if (kind === textPrefix) {
    return lineText(rest) === rest ? { kind: "text", text: rest } : null;
  }
  if (kind === "c:") {
    return idSchema.safeParse(rest).success ? { kind: "custom", id: rest } : null;
  }
  if (kind === "r:") {
    const separator = rest.lastIndexOf(":");
    const ingredientId = rest.slice(0, separator);
    const unit = rest.slice(separator + 1);
    if (separator === -1 || !idSchema.safeParse(ingredientId).success) return null;
    if (unit === vagueMark) return { kind: "vague", ingredientId };
    return units.has(unit) ? { kind: "recipe", ingredientId, unit: unit as Unit } : null;
  }
  return null;
}

/** A line key in what an action takes (Stories 3.4–3.6): only keys parseLineKey reads. */
export const lineKeySchema = z
  .string()
  .max(maxLineKeyChars)
  .refine((key) => parseLineKey(key) !== null, { message: "invalid_line_key" });

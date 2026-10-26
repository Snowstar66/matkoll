// ILIKE patterns for searching while typing (the catalog's ingredients, the
// recipe library). PostgREST passes the pattern to Postgres, where `\` is the
// escape character.

/**
 * An ILIKE pattern that finds `text` anywhere. `%`, `_` and `\` are escaped,
 * so they match themselves, and `*` (a wildcard in PostgREST filters) is
 * dropped. Empty text, or text of only `*`, gives "".
 */
export function containsPattern(text: string): string {
  const escaped = text.replace(/\*/g, "").replace(/[\\%_]/g, (char) => `\\${char}`);
  return escaped.trim() ? `%${escaped}%` : "";
}

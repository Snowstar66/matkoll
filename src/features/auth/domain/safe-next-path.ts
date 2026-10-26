/** Where a signed-in user lands when no (safe) `next` is given. */
export const defaultNextPath = "/recept";

const maxLength = 2048;
const base = "http://matkoll.invalid";

/**
 * Returns `raw` if it is a same-site path, otherwise `fallback` (AD-3). A safe
 * path starts with a single `/`, has no backslash or control character (which
 * browsers may turn into `//`) and still resolves to the same origin.
 */
export function safeNextPath(raw: string | null | undefined, fallback = defaultNextPath): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > maxLength) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Backslashes and C0/DEL control characters (tab, newline, ...) are normalised away by URL parsers.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

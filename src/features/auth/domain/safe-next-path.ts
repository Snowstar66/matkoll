/** Where a signed-in user lands when no (safe) `next` is given. */
export const defaultNextPath = "/recept";

/** The longest `next` that is kept; the login form's schema has the same cap. */
export const maxNextLength = 512;

const base = "https://x.invalid";

/** Backslashes and C0/DEL control characters (tab, newline, ...), which URL parsers normalise away. */
const unsafeCharacter = /[\\\u0000-\u001f\u007f]/;

/** A path that starts with exactly one "/" and has no unsafe character. */
function looksLikeLocalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !unsafeCharacter.test(path);
}

/**
 * Returns `raw` if it is a same-site path, otherwise `fallback` (AD-3). A safe
 * path starts with a single `/`, has no backslash or control character (which
 * browsers may turn into `//`), says the same once percent-decoded (so
 * `/%2F/evil` and `/%5Cevil` are refused) and still resolves to the same
 * origin. At most `maxNextLength` characters.
 */
export function safeNextPath(raw: string | null | undefined, fallback = defaultNextPath): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > maxNextLength) return fallback;
  if (!looksLikeLocalPath(raw)) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!looksLikeLocalPath(decoded)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

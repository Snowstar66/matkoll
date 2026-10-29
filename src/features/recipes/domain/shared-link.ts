import { maxImportUrlChars } from "./import";

// Story 1.13: a recipe page's address arrives in /recept/importera, from the
// bookmarklet, an iOS Shortcut or Android's share menu. Here it is only checked
// for shape; the approved-sites check and the SSRF checks are safeFetch's (AD-11).

const firstHttpsUrl = /https:\/\/[^\s"'<>]+/i;

/** The first https address in shared text ("Recept: https://www.koket.se/x"), without trailing punctuation. */
export function extractHttpsUrl(text: string): string | null {
  const match = firstHttpsUrl.exec(text);
  return match ? match[0].replace(/[.,;:!?)\]}]+$/, "") : null;
}

/** The address to import, or null when it is not a plain https link without credentials. */
export function validImportUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxImportUrlChars) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hostname === "") return null;
  return trimmed;
}

export type SharedLink = { status: "none" } | { status: "invalid"; value: string } | { status: "ok"; url: string };

/** Reads the `url` and `text` parameters: `url` first, else the first https address in `text`. */
export function readSharedLink(params: { url?: string | string[]; text?: string | string[] }): SharedLink {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const url = first(params.url).trim();
  const text = first(params.text);
  const candidate = url !== "" ? url : (extractHttpsUrl(text) ?? "");
  if (candidate === "") return { status: "none" };
  const valid = validImportUrl(candidate);
  return valid ? { status: "ok", url: valid } : { status: "invalid", value: candidate.slice(0, maxImportUrlChars) };
}

import type { SourceKind } from "./recipe-draft";

// The only place the text for a recipe's source is chosen (AD-10).

const labels: Record<Exclude<SourceKind, "url">, string> = {
  text: "Inklistrad text",
  photo: "Foto av kokbok",
  ai: "AI-förslag",
};

/** Shown for a link whose address cannot be read; the database only keeps http(s) addresses. */
const unknownLinkLabel = "Länk";

/**
 * Where the recipe came from, for display: the site's host name without
 * `www.` for a link ("koket.se"), otherwise "Inklistrad text", "Foto av
 * kokbok" or "AI-förslag".
 */
export function sourceLabel(kind: SourceKind, url: string | null): string {
  if (kind !== "url") return labels[kind];
  if (!url) return unknownLinkLabel;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || unknownLinkLabel;
  } catch {
    return unknownLinkLabel;
  }
}

// Menu text from a restaurant's own website, made ready for the reading. Pure and client-safe.

/** The most characters the reading gets; the rest of a longer page is cut (the port's inputLimits.menu.maxTextChars). */
export const maxMenuTextChars = 12_000;

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", ndash: "-", mdash: "-", eacute: "é", aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö" };

/**
 * Plain text for the reading: tags, scripts, styles and comments gone, entities decoded, blank runs collapsed, cut to
 * maxMenuTextChars at a line end when it can. Empty when nothing readable is left.
 */
export function cleanMenuText(raw: string): string {
  const text = raw
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?(p|div|br|li|tr|h[1-6]|section|article|ul|ol|table)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => entities[name] ?? entities[name.toLowerCase()] ?? whole)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f​﻿]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (text.length <= maxMenuTextChars) return text;
  const cut = text.slice(0, maxMenuTextChars);
  const lineEnd = cut.lastIndexOf("\n");
  return (lineEnd > maxMenuTextChars * 0.8 ? cut.slice(0, lineEnd) : cut).trim();
}

function codePoint(value: number): string {
  try {
    return String.fromCodePoint(value);
  } catch {
    return " ";
  }
}

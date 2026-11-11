// From a restaurant's own HTML page to the plain text that goes to the model, and to the address of its menu page. Pure.

const entities: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö", eacute: "é", ndash: "–", mdash: "—", hellip: "…" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isInteger(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : " ";
    }
    return entities[code] ?? whole;
  });
}

/** The visible text of an HTML page, scripts, styles and markup removed, white space collapsed, cut at `maxChars` characters. */
export function htmlToText(html: string, maxChars: number): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?(?:p|div|br|li|ul|ol|tr|td|th|h[1-6]|section|article|header|footer|nav|table)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  const text = decode(body)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
  return Array.from(text).slice(0, maxChars).join("");
}

const menuWord = /\b(meny|menyer|menu|menus|lunch|dagens|a la carte|à la carte|mat|food|dryck)\b/i;
const menuPath = /(meny|menu|lunch|dagens|carte|mat)(\b|[-_/.])/i;

/** The most likely menu pages linked from `html` on the same host as `baseUrl` (https only), best first, at most `max`. */
export function findMenuLinks(html: string, baseUrl: string, max = 1): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const found = new Map<string, number>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const href = decode(match[1] ?? match[2] ?? "").trim();
    if (href === "" || /^(?:mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== base.hostname) continue;
    url.hash = "";
    if (/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?)$/i.test(url.pathname)) continue;
    const label = decode((match[3] ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    let score = 0;
    if (/^(?:meny|menu|menyn|vår meny|our menu)$/i.test(label)) score += 3;
    else if (menuWord.test(label) && label.length <= 40) score += 2;
    if (menuPath.test(url.pathname)) score += 1;
    const key = url.toString();
    if (score > 0 && key !== base.toString()) found.set(key, Math.max(found.get(key) ?? 0, score));
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([url]) => url);
}

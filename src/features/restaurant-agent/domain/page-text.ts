// From a menu page's HTML to the plain text that goes on to Menyrådgivaren. Pure.

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

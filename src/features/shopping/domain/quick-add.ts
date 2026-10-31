import { collapseLabel, maxCustomLabelLength } from "./custom-item";

// Quick add by text (Story 17.9): what Siri or a shortcut dictates, split into
// own items without AI. Pure, so it is tested without a database.

/** The most items one call adds. */
export const maxQuickItems = 20;
/** The longest text a call takes, in characters; more is cut off before splitting. */
export const maxQuickTextLength = 2000;

// "och" between words, a comma, a semicolon, a line break or " & ".
const separator = /\s*(?:[,;&\n\r]|(?<![\p{L}\p{N}])och(?![\p{L}\p{N}]))\s*/giu;

/** First letter in capitals, the rest as said: "mjölk" is "Mjölk", "Arla mjölk" is kept. */
export function capitalizeFirst(text: string): string {
  const [first = "", ...rest] = [...text];
  return first.toLocaleUpperCase("sv-SE") + rest.join("");
}

/**
 * "mjölk och ägg" is "Mjölk", "Ägg". Trimmed, with single spaces, capitalised, empty and
 * repeated items dropped (same text in any case counts once), each cut to
 * maxCustomLabelLength characters, at most maxQuickItems.
 */
export function splitQuickText(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of text.slice(0, maxQuickTextLength).split(separator)) {
    const label = capitalizeFirst([...collapseLabel(part)].slice(0, maxCustomLabelLength).join("").trim());
    const key = label.toLocaleLowerCase("sv-SE");
    if (!label || seen.has(key)) continue;
    seen.add(key);
    items.push(label);
    if (items.length === maxQuickItems) break;
  }
  return items;
}

/** What Siri says: "La till: Mjölk, Ägg". */
export function quickAddedText(labels: readonly string[]): string {
  return `La till: ${labels.join(", ")}`;
}

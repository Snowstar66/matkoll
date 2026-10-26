// A package label as compared for repeats (Story 6.5): the AI port merges
// items whose labels have the same key, and a pantry suggestion keeps one
// label per key. The key ignores case, spacing, trailing punctuation and a
// trailing amount with its unit, so "Grädde 3 dl", "Grädde." and "grädde"
// are the same label: a model in a repetition loop often varies only those.

/** Trailing punctuation and dashes. */
const trailingPunctuation = /[\s.,;:!?…·\-–—]+$/u;
/**
 * A trailing amount with its unit: " 3 dl", " 1,5 l", " 36 %", " 500g", " 6 st".
 * A bare number stays ("Vara 2" and "Vara 3" are different labels).
 */
const trailingAmount = /\s\d+(?:[.,]\d+)?\s*(?:%|st|förp|g|hg|kg|ml|cl|dl|l|liter)$/iu;

/** The label's key: NFC, lower case, single spaces, without trailing punctuation or amounts (never empty for a label with text). */
export function labelKey(label: string): string {
  let key = label.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  for (;;) {
    const next = key.replace(trailingPunctuation, "").replace(trailingAmount, "").trim();
    if (next === key || next === "") return key;
    key = next;
  }
}

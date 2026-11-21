// Värt en titt, nivå 1 of a valuation: links that open a search for SOLD lookalikes on other sites, so the user sees
// what similar things actually went for. No price is ever given or guessed here; the numbers are on the other site.
// The phrase comes from "Förklara närmare" (its last section) or, before that, the föremål's name. Pure.
//
// What each link is, and how sure we are that it shows sold items:
// - Tradera: /search?q=…&itemStatus=Ended (ended listings). Seen only in one third-party script and not confirmed on
//   the live site, so the link says "avslutade" and the note under the links says it opens another site.
// - eBay: /sch/i.html?_nkw=…&LH_Sold=1&LH_Complete=1, eBay's own filter for sold, completed listings (documented
//   widely; the .com site is used, ebay.se is not a marketplace of its own).
// - Bukowskis: the auction house has no search address we could confirm, so the link is a Google search limited to
//   bukowskis.com (the lot pages there carry the final price). Said so in its label.

export type SoldLink = { key: "tradera" | "ebay" | "bukowskis"; label: string; hint: string; href: string };

/** The longest phrase searched for, in characters. */
const maxPhraseChars = 80;

/** A phrase as it is searched: one line, no quotation marks, cut to the length; "" when nothing is left. */
export function searchPhrase(text: string | null | undefined): string {
  const cleaned = (text ?? "")
    .replace(/["”“„'`´]/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length <= maxPhraseChars ? cleaned : cleaned.slice(0, maxPhraseChars).replace(/\s+\S*$/, "").trim();
}

/** The phrase to search with: the explanation's own when it has one, else the föremål's name; "" when neither is any. */
export function phraseForSearch(searchFromExplanation: string | null | undefined, name: string): string {
  return searchPhrase(searchFromExplanation) || searchPhrase(name);
}

/** The links for a phrase, in the order they are shown; none for an empty phrase. */
export function soldLinks(phrase: string): SoldLink[] {
  const q = searchPhrase(phrase);
  if (q === "") return [];
  const enc = encodeURIComponent(q);
  return [
    { key: "tradera", label: "Tradera", hint: "avslutade", href: `https://www.tradera.com/search?q=${enc}&itemStatus=Ended` },
    { key: "ebay", label: "eBay", hint: "sålda", href: `https://www.ebay.com/sch/i.html?_nkw=${enc}&LH_Sold=1&LH_Complete=1` },
    { key: "bukowskis", label: "Bukowskis", hint: "via Google", href: `https://www.google.com/search?q=${encodeURIComponent(`${q} site:bukowskis.com`)}` },
  ];
}

export const soldSearchTitleText = "Se vad liknande har sålts för";
export const soldSearchNoteText = "Sökning på sålda föremål öppnas på en annan sajt. Priserna beror på skick och märke.";

/** "Söker på: Orrefors kristallskål", so it is plain what is searched for. */
export function soldSearchingText(phrase: string): string {
  return `Söker på: ${phrase}`;
}

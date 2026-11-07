import { oneLine } from "@/lib/one-line";

// What an OfferTag says (UX-20): the offer's short item name and its price,
// "Gul lök 10 kr/kg". Pure, shared by every module that shows offers, so it
// lives in lib and imports no module (AD-1).

/** One offer as a tag: the item without brand ("Krossade tomater") and the price as the store wrote it, or `null`. */
export type OfferTagData = { name: string; price: string | null };

/** "Köp 3 betala för 2" is written "3 för 2" on a tag; every other price is kept as it is. */
export function tagPriceText(price: string | null | undefined): string | null {
  const text = oneLine(price ?? "");
  if (!text) return null;
  const multi = /^köp\s+(\d+)\s+betala\s+för\s+(\d+)$/i.exec(text);
  return multi ? `${multi[1]} för ${multi[2]}` : text;
}

/** The tag of an offer: the item's own name (the catalog's when it matched, never the brand), capitalised, and its price. */
export function offerTagOf(offer: { name: string; label: string; price?: string | null }): OfferTagData {
  const base = oneLine(offer.name) || oneLine(offer.label);
  return { name: base.charAt(0).toLocaleUpperCase("sv-SE") + base.slice(1), price: tagPriceText(offer.price) };
}

/** The tag as text: "Gul lök 10 kr/kg", or only the price with `priceOnly` (where the name stands beside it). */
export function offerTagText(tag: OfferTagData, priceOnly = false): string {
  if (priceOnly && tag.price) return tag.price;
  return [tag.name, tag.price].filter(Boolean).join(" ");
}

/** The tags without repeats (same text), in order. */
export function uniqueTags(tags: readonly OfferTagData[]): OfferTagData[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = offerTagText(tag);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

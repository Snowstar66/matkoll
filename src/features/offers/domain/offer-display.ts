import { dayText, weekEnd } from "./week";
import type { StoreOffer } from "./offer";

// How an offer reads in the list (Story 9.12): the product's name cleaned of
// the store's brand marker and country of origin, which go small under it.
// Display only: the stored label and name are never changed. Pure.

const countries = [
  "Sverige", "Norge", "Danmark", "Finland", "Island", "Tyskland", "Nederländerna", "Belgien", "Frankrike", "Spanien",
  "Italien", "Portugal", "Grekland", "Polen", "Österrike", "Ungern", "Irland", "Storbritannien", "England", "Skottland",
  "Litauen", "Lettland", "Estland", "Turkiet", "Israel", "Egypten", "Marocko", "Sydafrika", "Kenya", "Peru", "Chile",
  "Brasilien", "Ecuador", "Colombia", "Costa Rica", "Mexiko", "Argentina", "Dominikanska Republiken", "Nya Zeeland",
  "USA", "Kina", "Thailand", "Vietnam", "Indien",
];
const markers = ["ICA", "KRAV"];
// Producer brands that stand in front of the product and are not part of its name (Story 16.9); matched in any letter case.
const brands = ["Scan", "Arla", "Kronfågel", "Pågen"];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alternatives = (words: string[]) => words.map(escape).sort((a, b) => b.length - a.length).join("|");
const markerStart = new RegExp(`^(${alternatives([...markers, ...brands])})(?=[\\s.,/]|$)[\\s.,/]*`, "i");
const countryStart = new RegExp(`^(${alternatives(countries)})(?=[\\s.,/]|$)[\\s.,/]*(?:och\\s+(?=${alternatives(countries)}))?`, "i");

const canonical = (word: string, list: string[]) => list.find((entry) => entry.toLowerCase() === word.toLowerCase()) ?? word;

export type OfferDisplay = {
  /** The product's name: "Aubergine", "Jordgubbar i ask". */
  title: string;
  /** What was taken off the front, in the order it stood: "Spanien", "ICA", "KRAV". */
  extras: string[];
};

/**
 * "ICA. Spanien Aubergine" → title "Aubergine", extras ["Spanien", "ICA"];
 * "KRAV. Sverige Ekologiska böngroddar i ask" → "Ekologiska böngroddar i ask",
 * ["KRAV", "Sverige"]; several countries ("Nederländerna/Belgien") are one
 * extra. A label that is nothing but markers and countries is left as it is.
 */
export function offerDisplay(label: string): OfferDisplay {
  const original = label.replace(/\s+/g, " ").trim();
  let rest = original;
  const extras: string[] = [];
  let group: string[] = [];
  const flush = () => {
    if (group.length > 0) extras.push(group.join("/"));
    group = [];
  };
  for (;;) {
    const marker = markerStart.exec(rest);
    if (marker) {
      flush();
      const brand = canonical(marker[1], brands);
      extras.push(brands.includes(brand) ? brand : canonical(marker[1], markers).toUpperCase());
      rest = rest.slice(marker[0].length);
      continue;
    }
    const country = countryStart.exec(rest);
    if (country) {
      group.push(canonical(country[1], countries));
      rest = rest.slice(country[0].length);
      continue;
    }
    break;
  }
  flush();
  if (rest === "" || extras.length === 0) return { title: original, extras: [] };
  return { title: rest.charAt(0).toLocaleUpperCase("sv-SE") + rest.slice(1), extras };
}

/** The small line under the name: "Spanien · ICA · Stammis · Max 1 köp/hushåll · t.o.m. 22 nov". The price and saving stand on the right. */
export function offerDetailText(
  offer: Pick<StoreOffer, "label" | "memberOnly" | "note" | "validTo">,
  weekStart: string,
): string {
  const parts = [...offerDisplay(offer.label).extras, offer.memberOnly ? "Stammis" : null, offer.note];
  if (offer.validTo && offer.validTo !== weekEnd(weekStart)) parts.push(`t.o.m. ${dayText(offer.validTo)}`);
  return parts.filter(Boolean).join(" · ");
}

/** The price as a screen reader says it: "12 kr/st" → "12 kr per st". */
export function spokenPrice(price: string): string {
  return price.replace(/\s*\/\s*/g, " per ");
}

/** The row's name for a screen reader: "Aubergine, 12 kr per st, spara 20 %". */
export function offerSpokenName(offer: Pick<StoreOffer, "label" | "price" | "savingPercent">): string {
  return [
    offerDisplay(offer.label).title,
    offer.price ? spokenPrice(offer.price) : null,
    offer.savingPercent === null ? null : `spara ${offer.savingPercent} %`,
  ]
    .filter(Boolean)
    .join(", ");
}

import { compareCategories, displayCategory, type Category, type Section } from "@/features/catalog";
import { oneLine } from "@/lib/one-line";
import type { IcaOffer } from "./ica-offer-page";
import { clip } from "./offer-name";
import { savingText } from "./offer-saving";
import { dayText, swedishToday, weekEnd, weekLabel, weekShortLabel } from "./week";

// An offer as Matkoll keeps it (Story 9.1, AD-25): one store, one week. The
// limits and the source match store_offer's checks
// (supabase/migrations/*_offers_store_offer.sql, tests/design/offer-checks).
// Prices and conditions are shown as the store wrote them and never counted
// with. Pure.

export { maxOfferLabelChars, maxOfferNameChars } from "./offer-name";
export const maxOfferPriceChars = 40;
export const maxOfferNoteChars = 80;
/** At most this many offers per store and week (`offers_limit`). */
export const maxOffersPerWeek = 300;
/** A new fetch for the same store waits this long after the last one (`offers_fetched_recently`). */
export const offersFetchIntervalMs = 15 * 60_000;
/** After a store has said no (403, 429) the next fetch waits this long. */
export const offersBlockedIntervalMs = 6 * 60 * 60_000;

/** Where an offer came from: the store's link (9.1), pasted text (9.7) or a photo (9.8). */
export const OFFER_SOURCES = ["link", "text", "photo"] as const;
export type OfferSource = (typeof OFFER_SOURCES)[number];

/** An offer to save; save_store_offers takes a list of them. */
export type OfferDraft = {
  label: string;
  /** The item in its basic form, normalised; the catalog's name when it matched. */
  name: string;
  ingredientId: string | null;
  section: Section;
  price: string | null;
  note: string | null;
  memberOnly: boolean;
  /** The offer's last day, YYYY-MM-DD, or `null` when the store does not say. */
  validTo: string | null;
  source: OfferSource;
  /** The regular price in kronor, or `null` when not known (Story 9.11). */
  regularPrice: number | null;
  /** The saving in whole percent, or `null` when it cannot be stated (Story 9.11). */
  savingPercent: number | null;
};

/** An offer as it is stored and shown. */
export type StoreOffer = OfferDraft & {
  id: string;
  storeId: string;
  /** The week's Monday. */
  weekStart: string;
  createdAt: string;
};

/** A text as stored: one line, cut to `max`, or `null` when empty. */
function optionalText(text: string, max: number): string | null {
  const line = oneLine(text);
  return line ? clip(line, max) : null;
}

/**
 * The draft of a link offer: the label from offerName, the name and catalog
 * ingredient from the match, the price from `mechanicInfo` and the note from
 * `restriction`. The section is the catalog ingredient's, else the one ICA's
 * category stands for, else Övrigt.
 */
export function toOfferDraft(
  offer: IcaOffer,
  match: { label: string; name: string; ingredientId: string | null; section: Section | null; icaSection: Section | null },
): OfferDraft {
  return {
    label: match.label,
    name: match.name,
    ingredientId: match.ingredientId,
    section: match.section ?? match.icaSection ?? "Övrigt",
    price: optionalText(offer.mechanicInfo, maxOfferPriceChars),
    note: optionalText(offer.restriction, maxOfferNoteChars),
    memberOnly: offer.memberOnly,
    validTo: offer.validTo,
    source: "link",
    regularPrice: offer.regularPrice,
    savingPercent: offer.savingPercent,
  };
}

/** "7 erbjudanden", "1 erbjudande". */
export function offersCountWords(count: number): string {
  return `${count} ${count === 1 ? "erbjudande" : "erbjudanden"}`;
}

/** "Hämtade 7 erbjudanden för vecka 44.", the short confirmation after a fetch. */
export function offersFetchedText(count: number, weekStart: string): string {
  return `Hämtade ${offersCountWords(count)} för ${weekShortLabel(weekStart)}.`;
}

/** "2 varor som inte är mat togs inte med." under the sheet's heading after a fetch. */
export function offersSkippedText(skipped: number): string {
  return skipped === 1 ? "1 vara som inte är mat togs inte med." : `${skipped} varor som inte är mat togs inte med.`;
}

/** "Inga erbjudanden hämtade för vecka 44." */
export function noOffersText(weekStart: string): string {
  return `Inga erbjudanden hämtade för ${weekShortLabel(weekStart)}.`;
}

/** "Hämtar erbjudandena från ica.se …" while the page is fetched; Story 9.13 adds the store: "Hämtar Maxi från ica.se (1 av 2) …". */
export function fetchingOffersText(siteName: string, progress?: { store: string; at: number; of: number }): string {
  if (!progress || progress.of < 2) return `Hämtar erbjudandena från ${siteName} …`;
  return `Hämtar ${progress.store} från ${siteName} (${progress.at} av ${progress.of}) …`;
}

/** "Maxi ICA Stormarknad Östersund · vecka 44, 26 okt–1 nov", under the sheet's title. */
export function offersSheetSubtitle(storeName: string, weekStart: string): string {
  return `${storeName} · ${weekLabel(weekStart)}`;
}

/** Story 16.11: "2 butiker · v. 44 · 157 erbjudanden", the one meta line under the sheet's title (the Toppklipp count is added by the sheet). */
export function offersMetaText(input: { stores: string; weekStart: string; count: number }): string {
  return [input.stores, weekShortLabel(input.weekStart).replace("vecka ", "v. "), offersCountWords(input.count)].join(" · ");
}

/** Story 16.11: "Hämtade idag 13:30", the small line under the meta line (the link "Hämta igen" follows it). */
export function fetchedLineText(at: Date, now: Date): string {
  const text = fetchedAtText(at, now);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Öppna sidan på ica.se", the last link in the sheet. */
export function openOffersPageText(siteName: string): string {
  return `Öppna sidan på ${siteName}`;
}

/**
 * The line under an offer's name: price, "Stammis", the restriction and,
 * when the offer does not end with its week, its last day: "89 kr/kg ·
 * Stammis · Max 1 köp/hushåll · t.o.m. 22 nov".
 */
export function offerMetaText(
  offer: Pick<StoreOffer, "price" | "memberOnly" | "note" | "validTo" | "regularPrice" | "savingPercent">,
  weekStart: string,
): string {
  const parts = [offer.price, savingText(offer) || null, offer.memberOnly ? "Stammis" : null, offer.note];
  if (offer.validTo && offer.validTo !== weekEnd(weekStart)) parts.push(`t.o.m. ${dayText(offer.validTo)}`);
  return parts.filter(Boolean).join(" · ");
}

const swedishTime = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });

/** "hämtade idag 07:12", "hämtade igår 18:30" or "hämtade 26 okt 07:12", in Swedish time. */
export function fetchedAtText(at: Date, now: Date): string {
  const day = swedishToday(at);
  const today = swedishToday(now);
  const yesterday = swedishToday(new Date(now.getTime() - 86_400_000));
  const when = day === today ? "idag" : day === yesterday ? "igår" : dayText(day);
  return `hämtade ${when} ${swedishTime.format(at)}`;
}

/** "7 erbjudanden · hämtade idag 07:12", or only the count when the time is not known. */
export function offersSummaryText(count: number, fetchedAt: Date | null, now: Date): string {
  return fetchedAt ? `${offersCountWords(count)} · ${fetchedAtText(fetchedAt, now)}` : offersCountWords(count);
}

/**
 * The offers best saving first, "Bäst rabatt": by percent, those with no
 * stated saving last, and the page's order within equals (the sort is stable).
 */
export function bestSavingFirst<T extends Pick<StoreOffer, "savingPercent">>(offers: readonly T[]): T[] {
  return [...offers].sort((a, b) => (b.savingPercent ?? -1) - (a.savingPercent ?? -1));
}

/** The offers under their display categories, in the store's order of categories and the page's order within each. */
export function groupOffers<T extends Pick<StoreOffer, "section" | "name">>(offers: readonly T[]): { category: Category; offers: T[] }[] {
  const groups = new Map<Category, T[]>();
  for (const offer of offers) {
    const category = displayCategory(offer.section, offer.name);
    groups.set(category, [...(groups.get(category) ?? []), offer]);
  }
  return [...groups].sort(([a], [b]) => compareCategories(a, b)).map(([category, items]) => ({ category, offers: items }));
}

/** The words of "Föreslå rätter från veckans erbjudanden" (Story 9.5). */
export const suggestFromOffersText = {
  button: "Föreslå rätter från veckans erbjudanden",
  noOffers: "Hämta veckans erbjudanden först, så kan AI föreslå rätter som bygger på dem.",
  started: "Letar efter rätter från erbjudandena. Du kan göra annat under tiden.",
} as const;

/**
 * The shopping-list item an offer becomes (Story 9.12): the key is the offer's
 * id, so adding it twice is one item; the text is the offer's item (the
 * catalog's name when it matched, else the name as normalised) and a short
 * note, "Havregryn (Erbjudande: 89 kr/kg)", or with the store's short name
 * (Story 9.13) "Havregryn (Erbjudande Maxi: 89 kr/kg)"; the catalog ingredient is linked
 * when there is one.
 */
export function offerListItem(
  offer: Pick<StoreOffer, "id" | "name" | "label" | "price" | "ingredientId">,
  storeLabel?: string,
): {
  key: string;
  label: string;
  ingredientId: string | null;
} {
  const base = oneLine(offer.name) || oneLine(offer.label);
  const name = base.charAt(0).toLocaleUpperCase("sv-SE") + base.slice(1);
  const what = storeLabel ? `Erbjudande ${storeLabel}` : "Erbjudande";
  const note = offer.price ? ` (${what}: ${offer.price})` : ` (${what})`;
  return { key: offer.id, label: `${name}${note}`, ingredientId: offer.ingredientId };
}

/** "Lägg 3 i inköpslistan". */
export function addToListText(count: number): string {
  return `Lägg ${count} i inköpslistan`;
}

/** The toast after adding: "Lade 3 erbjudanden i inköpslistan." */
export function addedToListText(count: number): string {
  return `Lade ${offersCountWords(count)} i inköpslistan.`;
}

/** The toast after fetching from several stores: "Hämtade 12 erbjudanden från 2 butiker för vecka 44." */
export function offersFetchedManyText(count: number, stores: number, weekStart: string): string {
  return `Hämtade ${offersCountWords(count)} från ${stores} ${stores === 1 ? "butik" : "butiker"} för ${weekShortLabel(weekStart)}.`;
}

/** One store's line after fetching from several: "Hämtade 7 erbjudanden." */
export function offersFetchedStoreText(count: number): string {
  return `Hämtade ${offersCountWords(count)}.`;
}

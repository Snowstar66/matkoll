import { parseIcaOfferPage, type IcaOffer } from "./ica-offer-page";
import { maxOffersPerWeek } from "./offer";
import { isNamed, offerName, type OfferName } from "./offer-name";
import { addDays, isSavableWeek, mondayOf, swedishToday, weekOfValidTo, weekStartOf } from "./week";

// What a fetched store page gives before anything is matched or saved
// (Story 9.1, AD-25), the same for the in-app fetch ("Hämta veckans
// erbjudanden") and the scheduled one (Story 17.11, scripts/fetch-offers.ts),
// which reads a page once and saves it for every user who has that store.

/** An offer on the page that will be saved, with its cleaned label and names. */
export type OfferPageEntry = { offer: IcaOffer; name: OfferName };

/** The offers to save for one week (its Monday). */
export type OfferWeek = { weekStart: string; entries: OfferPageEntry[] };

/** The weeks to save, oldest first (one, or this week and next), and how many offers were left out. */
export type OfferPageRead = { weeks: OfferWeek[]; skipped: number };

/** Why a page gives nothing to save; `reason` is a fixed word for the log, never page content. */
export type OfferPageFailure = {
  code: "offers_page_changed" | "offers_none" | "offers_page_old";
  reason: string;
  skipped: number;
};

/** Saturday or Sunday in Swedish time. */
function isWeekend(now: Date): boolean {
  const day = new Date(`${swedishToday(now)}T00:00:00Z`).getUTCDay();
  return day === 6 || day === 0;
}

/** The named offers that last until `weekStart` or later, at most 300 (the week's limit). */
function weekOf(named: readonly OfferPageEntry[], weekStart: string): OfferWeek {
  return { weekStart, entries: named.filter((entry) => entry.offer.validTo >= weekStart).slice(0, maxOffersPerWeek) };
}

/**
 * Reads a store's offer page (ICA's, the only offer site so far) on `now`.
 * The page's week is the one most offers end in (the page has no first
 * days), and must be this week or the next; no offer that ended before it
 * began is saved, nor one whose label or name is empty once cleaned, and at
 * most 300 are, cut before matching. Everything left out is counted as
 * skipped, with the page's offers that are not food.
 *
 * Story 17.11: ICA puts next week's offers on the page late, on Sunday
 * evening or Monday, while this week's still fill it. On a Saturday or Sunday
 * (Swedish time), once next week's have come (at least half as many offers
 * end next week as end this week), the page is saved as two weeks: this
 * week's offers on this week, and those that last into next week on next
 * week, so they show at once; Monday's fetch then saves the whole week. On
 * other days, and before then, the offers that last longer (campaigns over
 * several weeks) stay with this week, so the sheet never swaps this week's
 * offers for a handful.
 */
export function readOfferPage(html: string, now: Date): { ok: true; data: OfferPageRead } | { ok: false; error: OfferPageFailure } {
  const read = parseIcaOfferPage(html);
  if (!read.ok) return { ok: false, error: { code: "offers_page_changed", reason: "page_shape", skipped: 0 } };
  let { skipped } = read.data;
  if (read.data.offers.length === 0) return { ok: false, error: { code: "offers_none", reason: "none", skipped } };

  const weekStart = weekOfValidTo(read.data.offers.map((offer) => offer.validTo));
  if (!weekStart || !isSavableWeek(weekStart, now)) {
    return { ok: false, error: { code: "offers_page_old", reason: "week", skipped } };
  }
  const current = read.data.offers
    .filter((offer) => offer.validTo >= weekStart)
    .map((offer) => ({ offer, name: offerName(offer) }));
  const named = current.filter((entry) => isNamed(entry.name));
  const page = weekOf(named, weekStart);
  skipped += current.length - page.entries.length;
  if (page.entries.length === 0) return { ok: false, error: { code: "offers_none", reason: "none", skipped } };

  const nextWeek = addDays(weekStartOf(now), 7);
  if (weekStart !== nextWeek && isWeekend(now)) {
    const thisWeekOnly = named.filter((entry) => entry.offer.validTo < nextWeek);
    const endsNextWeek = named.filter((entry) => mondayOf(entry.offer.validTo) === nextWeek).length;
    if (endsNextWeek > 0 && endsNextWeek * 2 >= thisWeekOnly.length) {
      const thisWeek = { weekStart, entries: thisWeekOnly.slice(0, maxOffersPerWeek) };
      return { ok: true, data: { weeks: [thisWeek, weekOf(named, nextWeek)], skipped } };
    }
  }
  return { ok: true, data: { weeks: [page], skipped } };
}

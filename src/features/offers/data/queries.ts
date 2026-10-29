import "server-only";
import { sectionSchema } from "@/features/catalog";
import { OFFER_SOURCES, offersBlockedIntervalMs, offersFetchIntervalMs, type OfferSource, type StoreOffer } from "../domain/offer";
import { swedishToday, weekStartOf } from "../domain/week";
import { OffersDataError, type OffersDb } from "./client";

// Reads of store_offer (AD-1, AD-25). RLS limits every read to the
// signed-in user's rows; the store is passed in, since the offers follow the
// store the caller has read from settings.

const offerColumns =
  "id, store_id, week_start, label, name, ingredient_id, section, price, note, member_only, valid_to, source, regular_price, saving_percent, created_at";

type OfferRow = {
  id: string;
  store_id: string;
  week_start: string;
  label: string;
  name: string;
  ingredient_id: string | null;
  section: string;
  price: string | null;
  note: string | null;
  member_only: boolean;
  valid_to: string | null;
  source: string;
  regular_price: number | null;
  saving_percent: number | null;
  created_at: string;
};

/** A row as the domain's StoreOffer. A section or source the checks would refuse reads as Övrigt and text. */
export function toStoreOffer(row: OfferRow): StoreOffer {
  const section = sectionSchema.safeParse(row.section);
  const source = (OFFER_SOURCES as readonly string[]).includes(row.source) ? (row.source as OfferSource) : "text";
  return {
    id: row.id,
    storeId: row.store_id,
    weekStart: row.week_start,
    label: row.label,
    name: row.name,
    ingredientId: row.ingredient_id,
    section: section.success ? section.data : "Övrigt",
    price: row.price,
    note: row.note,
    memberOnly: row.member_only,
    validTo: row.valid_to,
    source,
    regularPrice: row.regular_price,
    savingPercent: row.saving_percent,
    createdAt: row.created_at,
  };
}

/**
 * The store's offers for the week `weekStart`, in the page's order (by
 * created_at, which save_store_offers sets in that order). Throws
 * OffersDataError.
 */
export async function loadOffers(db: OffersDb, storeId: string, weekStart: string): Promise<StoreOffer[]> {
  const { data, error } = await db
    .from("store_offer")
    .select(offerColumns)
    .eq("store_id", storeId)
    .eq("week_start", weekStart)
    .order("created_at")
    .order("id");
  if (error) throw new OffersDataError(`query_failed ${error.code}`);
  return data.map(toStoreOffer);
}

/**
 * Veckans erbjudanden for a store (AD-25): the offers of the latest week that
 * is not over, without those whose last day has passed, in the page's order.
 * Weeks are never mixed. Empty when there are none. Throws OffersDataError.
 */
export async function loadActiveOffers(db: OffersDb, storeId: string, now: Date): Promise<StoreOffer[]> {
  const thisWeek = weekStartOf(now);
  const latest = await db
    .from("store_offer")
    .select("week_start")
    .eq("store_id", storeId)
    .gte("week_start", thisWeek)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new OffersDataError(`query_failed ${latest.error.code}`);
  if (!latest.data) return [];
  const today = swedishToday(now);
  return (await loadOffers(db, storeId, latest.data.week_start)).filter((offer) => !offer.validTo || offer.validTo >= today);
}

/** When the store's offers were last fetched from its link (the newest link row), or `null`. Throws OffersDataError. */
export async function loadLastFetch(db: OffersDb, storeId: string): Promise<Date | null> {
  const { data, error } = await db
    .from("store_offer")
    .select("created_at")
    .eq("store_id", storeId)
    .eq("source", "link")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new OffersDataError(`query_failed ${error.code}`);
  return data ? new Date(data.created_at) : null;
}

/**
 * Claims the right to fetch the store's page now: sets `offers_attempted_at`
 * to `now` in one conditional UPDATE, only when it is null or older than the
 * cooldown (15 minutes; 6 hours after a 403 or 429, see `blockFetch`). `false`
 * when no row changed, which means the fetch is throttled. Every attempt is
 * recorded, whether or not it saves offers, and two taps at the same time
 * cannot both claim. Throws OffersDataError.
 */
export async function claimFetch(db: OffersDb, storeId: string, now: Date): Promise<boolean> {
  const before = new Date(now.getTime() - offersFetchIntervalMs).toISOString();
  const { data, error } = await db
    .from("store")
    .update({ offers_attempted_at: now.toISOString() })
    .eq("id", storeId)
    .or(`offers_attempted_at.is.null,offers_attempted_at.lt.${before}`)
    .select("id");
  if (error) throw new OffersDataError(`query_failed ${error.code}`);
  return data.length > 0;
}

/** After a 403 or 429: the next claim waits 6 hours from `now` (the stamp is pushed into the future). Throws OffersDataError. */
export async function blockFetch(db: OffersDb, storeId: string, now: Date): Promise<void> {
  const until = new Date(now.getTime() + offersBlockedIntervalMs - offersFetchIntervalMs);
  const { error } = await db.from("store").update({ offers_attempted_at: until.toISOString() }).eq("id", storeId);
  if (error) throw new OffersDataError(`query_failed ${error.code}`);
}

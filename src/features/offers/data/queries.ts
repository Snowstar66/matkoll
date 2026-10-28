import "server-only";
import { sectionSchema } from "@/features/catalog";
import { OFFER_SOURCES, type OfferSource, type StoreOffer } from "../domain/offer";
import { swedishToday, weekStartOf } from "../domain/week";
import { OffersDataError, type OffersDb } from "./client";

// Reads of store_offer (AD-1, AD-25). RLS limits every read to the
// signed-in user's rows; the store is passed in, since the offers follow the
// store the caller has read from settings.

const offerColumns =
  "id, store_id, week_start, label, name, ingredient_id, section, price, note, member_only, valid_to, source, created_at";

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

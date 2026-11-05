import "server-only";
import { fail, ok, type Result } from "@/lib/errors";
import type { OfferDraft, OfferSource } from "../domain/offer";
import type { OffersDb } from "./client";

// Writes to store_offer through the Postgres function save_store_offers
// (supabase/migrations/*_offers_store_offer.sql), which does everything in
// one transaction (AD-1, AD-25).

/**
 * Saves `items` for the store and week, replacing the week's rows from
 * `replaceSource` first when it is given. Gives the number of offers the
 * store has for the week, or `offers_week_invalid` (a week that is over or
 * further ahead, MK416), `offers_limit` (over 300, MK422),
 * `offers_store_missing` (not the user's store, P0002) or `offers_failed`
 * (anything else, logged with its code only).
 */
export async function saveOffersIn(
  db: OffersDb,
  input: { storeId: string; weekStart: string; items: readonly OfferDraft[]; replaceSource?: OfferSource },
): Promise<Result<number>> {
  const items = input.items.map((item) => ({
    label: item.label,
    name: item.name,
    ingredient_id: item.ingredientId,
    section: item.section,
    price: item.price,
    note: item.note,
    member_only: item.memberOnly,
    valid_to: item.validTo,
    source: item.source,
    regular_price: item.regularPrice,
    saving_percent: item.savingPercent,
  }));
  const { data, error } = await db.rpc("save_store_offers", {
    store: input.storeId,
    week: input.weekStart,
    items,
    ...(input.replaceSource ? { replace_source: input.replaceSource } : {}),
  });
  if (!error) return ok(data);
  if (error.code === "MK416") return fail("offers_week_invalid");
  if (error.code === "MK422") return fail("offers_limit");
  if (error.code === "P0002") return fail("offers_store_missing");
  console.error("offers_failed", { reason: `save_store_offers ${error.code}` });
  return fail("offers_failed");
}

/**
 * Deletes the user's offers (any week) of every store not in `keepStoreIds`
 * (Story 16.8), through clear_other_store_offers. Gives the number of rows
 * removed, or `offers_failed` (also for an empty `keepStoreIds`, which the
 * function refuses, so a failed fetch can never wipe everything).
 */
export async function clearOtherStoreOffersIn(db: OffersDb, keepStoreIds: readonly string[]): Promise<Result<number>> {
  const { data, error } = await db.rpc("clear_other_store_offers", { keep: [...keepStoreIds] });
  if (!error) return ok(data);
  console.error("offers_failed", { reason: `clear_other_store_offers ${error.code}` });
  return fail("offers_failed");
}

/**
 * Story 9.10: links offers that have no catalog ingredient to `ingredientId`
 * (and its section). Only rows still without one are touched, so a retry or a
 * second run changes nothing twice. Gives the number of rows linked, or
 * `offers_failed` (logged with the Postgres code only).
 */
export async function linkOffersToIngredientIn(
  db: OffersDb,
  input: { offerIds: readonly string[]; ingredientId: string; section: OfferDraft["section"] },
): Promise<Result<number>> {
  const { data, error } = await db
    .from("store_offer")
    .update({ ingredient_id: input.ingredientId, section: input.section })
    .in("id", [...input.offerIds])
    .is("ingredient_id", null)
    .select("id");
  if (!error) return ok(data.length);
  console.error("offers_failed", { reason: `link_offers ${error.code}` });
  return fail("offers_failed");
}

/**
 * Story 9.10: what an earlier match already found. The catalog ingredient of
 * the store's offers that have one, by offer name (the newest row wins), for
 * the names asked for. A refetch gives the offers back their link without
 * asking the AI again. `null` when the read fails (the offers are then saved
 * without it, as before).
 */
export async function loadLinkedNamesIn(
  db: OffersDb,
  storeId: string,
  names: readonly string[],
): Promise<ReadonlyMap<string, string> | null> {
  const found = new Map<string, string>();
  const unique = [...new Set(names)];
  for (let from = 0; from < unique.length; from += 100) {
    const { data, error } = await db
      .from("store_offer")
      .select("name, ingredient_id, created_at")
      .eq("store_id", storeId)
      .in("name", unique.slice(from, from + 100))
      .not("ingredient_id", "is", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("offers_failed", { reason: `linked_names ${error.code}` });
      return null;
    }
    for (const row of data) if (row.ingredient_id) found.set(row.name, row.ingredient_id);
  }
  return found;
}

/**
 * Story 9.10: claims the right to ask the AI about these offers: stamps
 * `ai_matched_at` on those not stamped yet, in one conditional UPDATE, and gives
 * the ids that were claimed. Two visits at the same time cannot both claim an
 * offer, and an offer already asked about (linked or answered "none") is never
 * claimed again. `null` when the write fails (logged with the code only).
 */
export async function claimOffersForAiIn(db: OffersDb, offerIds: readonly string[], now: Date): Promise<string[] | null> {
  const { data, error } = await db
    .from("store_offer")
    .update({ ai_matched_at: now.toISOString() })
    .in("id", [...offerIds])
    .is("ai_matched_at", null)
    .select("id");
  if (!error) return data.map((row) => row.id);
  console.error("offers_failed", { reason: `claim_ai ${error.code}` });
  return null;
}

/** Takes a claim back (the AI did not answer), so the next visit asks again. Logged with the code only when it fails. */
export async function releaseOffersForAiIn(db: OffersDb, offerIds: readonly string[]): Promise<void> {
  const { error } = await db.from("store_offer").update({ ai_matched_at: null }).in("id", [...offerIds]);
  if (error) console.error("offers_failed", { reason: `release_ai ${error.code}` });
}

/** Story 9.10: the offer names of the store the AI has already been asked about (any week). `null` when the read fails. */
export async function loadAskedNamesIn(db: OffersDb, storeId: string, names: readonly string[]): Promise<ReadonlySet<string> | null> {
  const found = new Set<string>();
  const unique = [...new Set(names)];
  for (let from = 0; from < unique.length; from += 100) {
    const { data, error } = await db
      .from("store_offer")
      .select("name")
      .eq("store_id", storeId)
      .in("name", unique.slice(from, from + 100))
      .not("ai_matched_at", "is", null);
    if (error) {
      console.error("offers_failed", { reason: `asked_names ${error.code}` });
      return null;
    }
    for (const row of data) found.add(row.name);
  }
  return found;
}

/** After a save: stamps the week's offers with these names as asked (carried over from before the refetch). Logged with the code only. */
export async function markNamesAskedIn(
  db: OffersDb,
  input: { storeId: string; weekStart: string; names: readonly string[]; now: Date },
): Promise<void> {
  const names = [...new Set(input.names)];
  for (let from = 0; from < names.length; from += 100) {
    const { error } = await db
      .from("store_offer")
      .update({ ai_matched_at: input.now.toISOString() })
      .eq("store_id", input.storeId)
      .eq("week_start", input.weekStart)
      .in("name", names.slice(from, from + 100))
      .is("ai_matched_at", null);
    if (error) console.error("offers_failed", { reason: `mark_asked ${error.code}` });
  }
}

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

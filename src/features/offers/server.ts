import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadActiveOffers, loadLastFetch, loadOffers } from "./data/queries";
import { linkOffersToIngredientIn } from "./data/save";
import type { StoreOffer } from "./domain/offer";

// Server-only entry (AD-1, AD-25): the offers module owns store_offer, and
// no other module reads or writes it. The functions use the signed-in user's
// session client, so RLS limits them to the user's own rows; the store comes
// from settings (getSelectedStore), read by the caller. Writes go through
// the actions in ./actions. Memoised per request.

/** What the functions below throw when Supabase fails; never user data. */
export { OffersDataError } from "./data/client";

/**
 * Veckans erbjudanden for the store: the latest week that is not over,
 * without offers whose last day has passed. Throws OffersDataError.
 */
export const getActiveOffers = cache(async (storeId: string): Promise<StoreOffer[]> =>
  loadActiveOffers(await createClient(), storeId, new Date()),
);

/** The store's offers for the week that starts on `weekStart`, in the page's order. Throws OffersDataError. */
export const listOffers = cache(async (storeId: string, weekStart: string): Promise<StoreOffer[]> =>
  loadOffers(await createClient(), storeId, weekStart),
);

/** When the store's offers were last fetched from its link, or `null`. Throws OffersDataError. */
export const getLastFetch = cache(async (storeId: string): Promise<Date | null> =>
  loadLastFetch(await createClient(), storeId),
);

/**
 * Story 9.10: links offers without a catalog ingredient to one (only rows still
 * without one are touched). Gives how many were linked, or `offers_failed`.
 * Only for the AI match in suggestions, which has checked the ingredient is the user's.
 */
export async function linkOffersToIngredient(input: Parameters<typeof linkOffersToIngredientIn>[1]) {
  return linkOffersToIngredientIn(await createClient(), input);
}

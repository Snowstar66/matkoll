"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientSummaries, matchIngredients } from "@/features/catalog/server";
import { OFFER_SITE_DOMAINS, parseOffersLink, type Store } from "@/features/settings";
import { listStores, SettingsDataError } from "@/features/settings/server";
import { fail, ok, type ErrorCode, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";
import { fetchOfferPage } from "@/server/fetch";
import { OffersDataError } from "../data/client";
import { blockFetch, claimFetch } from "../data/queries";
import { readOfferPage } from "../domain/offer-page-read";
import { saveOfferPageIn } from "./save-offer-page";

// "Hämta veckans erbjudanden" (FR-34, Story 9.1, AD-11, AD-25): one fetch of
// the store's offer page per tap, read without AI and saved at once. The
// client sends only the store's id; the address is the one saved for the
// store, checked against OFFER_SITES again here. Nothing is retried: a store
// that says no (403, 429) gets the fallback, never a new request. The page
// is dropped as soon as it is read, and the logs hold only error codes and
// counts, never the address, the items, the prices or anything else in the
// page (its session token and cookies included).

export type FetchStoreOffersData = {
  /** The offers the store now has for the week. */
  saved: number;
  /** The page's offers that are not food, left out. */
  skipped: number;
  /** The offers on food that matched a catalog ingredient. */
  matched: number;
  /** The week's Monday. */
  weekStart: string;
};

export type FetchStoreOffersResult = Result<FetchStoreOffersData>;

const inputSchema = z.object({ storeId: z.guid() });

/** Logs an expected failure with its code and a fixed reason only. */
function failWith(code: ErrorCode, reason: string): ReturnType<typeof fail> {
  console.error(code, { reason });
  return fail(code);
}

/**
 * Fetches and saves the weekly offers of the signed-in user's store
 * `storeId`. Gives the counts and the week, or `unauthorized`, `validation`,
 * `offers_store_missing`, `offers_link_missing`, `offers_link_unsupported`,
 * `offers_fetched_recently` (within 15 minutes of the last fetch),
 * `offers_fetch_blocked` (403, 429; `offers_fetch_scheduled` instead on Vercel,
 * Story 17.11), `offers_fetch_failed`,
 * `offers_page_changed`, `offers_none`, `offers_page_old`,
 * `offers_week_invalid`, `offers_limit`, `offers_failed`,
 * `settings_store_unavailable` or `catalog_unavailable`.
 */
export async function fetchStoreOffers(input: { storeId: string }): Promise<FetchStoreOffersResult> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { storeId } = parsed.data;

  let store: Store | undefined;
  try {
    store = (await listStores()).find((candidate) => candidate.id === storeId);
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    return failWith("settings_store_unavailable", error.detail);
  }
  if (!store) return fail("offers_store_missing");
  if (!store.offersUrl) return fail("offers_link_missing");
  const link = parseOffersLink(store.offersUrl, store.chain);
  if (!link) return fail("offers_link_unsupported");

  const db = await createClient();
  const now = new Date();
  try {
    // Every attempt is recorded before the request, in one conditional UPDATE: no row changed means throttled.
    if (!(await claimFetch(db, storeId, now))) return fail("offers_fetched_recently");
  } catch (error) {
    if (!(error instanceof OffersDataError)) throw error;
    return failWith("offers_failed", error.detail);
  }

  // Exactly one fetch, never retried.
  const { page, status } = await fetchOfferPage(link.url, {
    allowedDomains: OFFER_SITE_DOMAINS,
    signal: new AbortController().signal,
  });
  if (!page.ok) {
    if (status === 403 || status === 429) {
      try {
        await blockFetch(db, storeId, now);
      } catch (error) {
        if (!(error instanceof OffersDataError)) throw error;
        console.error("offers_failed", { reason: error.detail });
      }
      // Story 17.11: in the cloud the store's site refuses the app's servers, so a
      // job fetches the offers every morning and Sunday evening instead
      // (docs/molnet.md); the sheet says so calmly. On a computer the refusal is shown as it is.
      console.error("offers_fetch_blocked", { reason: `status_${status}` });
      return fail(env.VERCEL ? "offers_fetch_scheduled" : "offers_fetch_blocked");
    }
    return failWith("offers_fetch_failed", page.error.code);
  }

  const read = readOfferPage(page.data.html, now);
  if (!read.ok) {
    if (read.error.code === "offers_none") {
      console.info("offers_none", { skipped: read.error.skipped });
      return fail("offers_none");
    }
    return failWith(read.error.code, read.error.reason);
  }

  let saved: Awaited<ReturnType<typeof saveOfferPageIn>>;
  try {
    saved = await saveOfferPageIn(db, { storeId, read: read.data }, { match: matchIngredients, summaries: getIngredientSummaries });
  } catch (error) {
    if (!(error instanceof CatalogDataError)) throw error;
    return failWith("catalog_unavailable", "match");
  }
  if (!saved.ok) return saved;
  revalidateFor("store_offer");
  const { skipped } = read.data;
  const { weekStart } = saved.data;
  console.info("offers_fetched", { saved: saved.data.saved, skipped, matched: saved.data.matched, withRegularPrice: saved.data.withRegularPrice });
  return ok({ saved: saved.data.saved, skipped, matched: saved.data.matched, weekStart });
}

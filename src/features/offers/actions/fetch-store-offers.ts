"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import type { IngredientMatch } from "@/features/catalog";
import { CatalogDataError, getIngredientSummaries, matchIngredients } from "@/features/catalog/server";
import { OFFER_SITE_DOMAINS, parseOffersLink, type Store } from "@/features/settings";
import { listStores, SettingsDataError } from "@/features/settings/server";
import { fail, ok, type ErrorCode, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { fetchOfferPage } from "@/server/fetch";
import { OffersDataError } from "../data/client";
import { blockFetch, claimFetch } from "../data/queries";
import { saveOffersIn } from "../data/save";
import { foodSection, parseIcaOfferPage, type IcaOffer } from "../domain/ica-offer-page";
import { maxOffersPerWeek, toOfferDraft, type OfferDraft } from "../domain/offer";
import { isNamed, offerName, type OfferName } from "../domain/offer-name";
import { isSavableWeek, weekOfValidTo } from "../domain/week";

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

/** The catalog ingredient for each offer: its first name that matched exactly or as a synonym. */
async function matchOffers(names: readonly OfferName[]) {
  const items = names.flatMap((name) => name.candidates.map((text) => ({ text })));
  const matches: IngredientMatch[] = items.length > 0 ? await matchIngredients(items) : [];
  let at = 0;
  const found = names.map((name) => {
    let hit: { name: string; ingredientId: string } | null = null;
    for (const candidate of name.candidates) {
      const match = matches[at++];
      if (!hit && match?.kind === "match" && match.confidence !== "hint") hit = { name: candidate, ingredientId: match.ingredientId };
    }
    return { label: name.label, name: hit?.name ?? name.fallback, ingredientId: hit?.ingredientId ?? null };
  });
  const ids = [...new Set(found.flatMap((entry) => (entry.ingredientId ? [entry.ingredientId] : [])))];
  const summaries = ids.length > 0 ? await getIngredientSummaries(ids) : {};
  return found.map((entry) => ({
    ...entry,
    section: (entry.ingredientId ? summaries[entry.ingredientId]?.section : undefined) ?? null,
  }));
}

/**
 * Fetches and saves the weekly offers of the signed-in user's store
 * `storeId`. Gives the counts and the week, or `unauthorized`, `validation`,
 * `offers_store_missing`, `offers_link_missing`, `offers_link_unsupported`,
 * `offers_fetched_recently` (within 15 minutes of the last fetch),
 * `offers_fetch_blocked` (403, 429), `offers_fetch_failed`,
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
      return failWith("offers_fetch_blocked", `status_${status}`);
    }
    return failWith("offers_fetch_failed", page.error.code);
  }

  const read = parseIcaOfferPage(page.data.html);
  if (!read.ok) return failWith("offers_page_changed", "page_shape");
  let { skipped } = read.data;
  if (read.data.offers.length === 0) {
    console.info("offers_none", { skipped });
    return fail("offers_none");
  }

  const weekStart = weekOfValidTo(read.data.offers.map((offer) => offer.validTo));
  if (!weekStart || !isSavableWeek(weekStart, now)) return failWith("offers_page_old", "week");
  // An offer that ended before the week began is over: it is not saved.
  // An offer with nothing left of its label or name once cleaned is not saved either, and the offers
  // beyond the week's limit are cut before matching (the rest are counted as skipped).
  const current = read.data.offers
    .filter((offer) => offer.validTo >= weekStart)
    .map((offer) => ({ offer, name: offerName(offer) }));
  const named = current.filter((entry) => isNamed(entry.name));
  const kept = named.slice(0, maxOffersPerWeek);
  skipped += current.length - kept.length;
  const offers: IcaOffer[] = kept.map((entry) => entry.offer);
  if (kept.length === 0) {
    console.info("offers_none", { skipped });
    return fail("offers_none");
  }

  let drafts: OfferDraft[];
  try {
    const matches = await matchOffers(kept.map((entry) => entry.name));
    drafts = offers.map((offer, index) =>
      toOfferDraft(offer, { ...matches[index], icaSection: foodSection(offer.category) }),
    );
  } catch (error) {
    if (!(error instanceof CatalogDataError)) throw error;
    return failWith("catalog_unavailable", "match");
  }

  const saved = await saveOffersIn(db, { storeId, weekStart, items: drafts, replaceSource: "link" });
  if (!saved.ok) {
    if (saved.error.code === "offers_week_invalid") return failWith("offers_page_old", "week_refused");
    return saved;
  }
  revalidateFor("store_offer");
  const matched = drafts.filter((draft) => draft.ingredientId !== null).length;
  const withRegularPrice = drafts.filter((draft) => draft.regularPrice !== null).length;
  console.info("offers_fetched", { saved: saved.data, skipped, matched, withRegularPrice });
  return ok({ saved: saved.data, skipped, matched, weekStart });
}

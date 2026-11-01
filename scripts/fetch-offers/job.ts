// Story 17.11: the scheduled fetch of the weekly offers, run every morning and
// Sunday evening by .github/workflows/offers.yml (ICA refuses Vercel's servers but not GitHub's).
// The CLI is scripts/fetch-offers.ts; this file takes everything that talks to
// the outside world as an argument, so the integration test runs it against
// local Supabase with the saved test pages.
//
// The rules are the in-app fetch's (Story 9.1, AD-25): the same safe fetch and
// honest headers, the same reader and the same save, the attempt recorded on
// the store before the request and a 403 or 429 blocking it for 6 hours. On
// top: one page at a time with a pause between, and one request per page even
// when several users have the store. The service role only lists the stores
// and signs in as their owners; every write goes through the owner's own
// session, as in the app (save_store_offers is for signed-in users only).
// The log holds codes and counts, never an address, a store, a user or an offer.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { saveOfferPageIn, type OfferCatalog } from "@/features/offers/actions/save-offer-page";
import { blockFetch, claimFetch } from "@/features/offers/data/queries";
import { readOfferPage, type OfferPageRead } from "@/features/offers/domain/offer-page-read";
import type { Database } from "@/lib/supabase/database.types";
import type { OfferPageFetch } from "@/server/fetch/offer-page";
import { planOfferFetches, type StoreRow } from "./plan.ts";

export type Db = SupabaseClient<Database>;

/** A user's session for the run: the client, and how to end the session again. */
export type UserSession = { db: Db; signOut: () => Promise<void> };

export type JobDeps = {
  /** Every store with a link (loadStoreRows with the service role). */
  listStores: () => Promise<StoreRow[]>;
  /** Signs in as the user (throws when it cannot). */
  signIn: (userId: string) => Promise<UserSession>;
  /** One request for the page, never retried. */
  fetchPage: (url: string) => Promise<OfferPageFetch>;
  /** The catalog functions for the user behind `db`. */
  catalogFor: (db: Db) => OfferCatalog;
  now: () => Date;
  /** The pause between two pages. */
  pause: () => Promise<void>;
  log: (event: string, fields: Record<string, string | number>) => void;
};

/** How each page reader turns a page into offers, by the offer site's host. A new chain adds its reader here. */
const readers: Record<string, (html: string, now: Date) => ReturnType<typeof readOfferPage>> = {
  "www.ica.se": readOfferPage,
};

/** What happened to the stores, counted. */
export type JobSummary = {
  pages: number;
  stores: number;
  /** Stores whose offers were saved, and how many offers they got in all. */
  saved: number;
  offers: number;
  /** Stores fetched (by the app or a run) in the last 15 minutes: left alone. */
  recently: number;
  /** Stores whose page answered 403 or 429. */
  blocked: number;
  /** Stores whose page had no food offers. */
  none: number;
  /** Stores that failed otherwise (fetch, page, sign-in, save). */
  failed: number;
  withoutLink: number;
  unsupported: number;
};

const pageSize = 1000;
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** Every store with a link, read with the service role, page by page; `userIds` limits it to those users (for tests). */
export async function loadStoreRows(admin: Db, options: { userIds?: readonly string[] } = {}): Promise<StoreRow[]> {
  const rows: StoreRow[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = admin.from("store").select("id, user_id, chain, offers_url").not("offers_url", "is", null);
    if (options.userIds) query = query.in("user_id", [...options.userIds]);
    const { data, error } = await query.order("id").range(from, from + pageSize - 1);
    if (error) throw new Error(`offers_job_stores_failed ${error.code || "no_answer"}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

/**
 * A session as the user, the way the app's sign-in link makes one: a
 * one-time token from generateLink with the service role (nothing is
 * mailed), exchanged at once with the publishable key. Signed out after the
 * run, so no refresh token is left behind. Throws with a code only.
 */
export async function signInAs(admin: Db, settings: { url: string; publishableKey: string }, userId: string): Promise<UserSession> {
  const found = await admin.auth.admin.getUserById(userId);
  const email = found.data.user?.email;
  if (found.error || !email) throw new Error("offers_job_user_missing");
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`offers_job_link_failed ${link.error.code ?? link.error.status}`);
  const db: Db = createClient<Database>(settings.url, settings.publishableKey, clientOptions);
  const verified = await db.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "email" });
  if (verified.error) throw new Error(`offers_job_sign_in_failed ${verified.error.code ?? verified.error.status}`);
  return {
    db,
    signOut: async () => {
      await db.auth.signOut({ scope: "local" });
    },
  };
}

/** Runs the job once. Gives the counts; throws only when the stores cannot be read. */
export async function runOffersJob(deps: JobDeps): Promise<JobSummary> {
  const plan = planOfferFetches(await deps.listStores());
  const summary: JobSummary = {
    pages: plan.pages.length,
    stores: plan.pages.reduce((sum, page) => sum + page.stores.length, 0),
    saved: 0,
    offers: 0,
    recently: 0,
    blocked: 0,
    none: 0,
    failed: 0,
    withoutLink: plan.withoutLink,
    unsupported: plan.unsupported,
  };
  deps.log("offers_job_planned", { pages: summary.pages, stores: summary.stores, withoutLink: plan.withoutLink, unsupported: plan.unsupported });

  const sessions = new Map<string, Promise<UserSession>>();
  const sessionOf = (userId: string) => {
    let session = sessions.get(userId);
    if (!session) {
      session = deps.signIn(userId);
      sessions.set(userId, session);
    }
    return session;
  };

  try {
    let requested = false;
    for (const [index, page] of plan.pages.entries()) {
      const at = { page: index + 1, of: plan.pages.length };
      const read = readers[page.host];
      if (!read) {
        summary.unsupported += page.stores.length;
        deps.log("offers_job_page", { ...at, result: "no_reader" });
        continue;
      }

      // Every store claims its attempt first, as a tap in the app does; a store fetched in the last 15 minutes is left alone.
      const now = deps.now();
      const claimed: { storeId: string; db: Db }[] = [];
      for (const store of page.stores) {
        try {
          const { db } = await sessionOf(store.userId);
          if (await claimFetch(db, store.storeId, now, { pastBlock: true })) claimed.push({ storeId: store.storeId, db });
          else summary.recently++;
        } catch {
          summary.failed++;
          deps.log("offers_job_store", { ...at, result: "claim_failed" });
        }
      }
      if (claimed.length === 0) {
        deps.log("offers_job_page", { ...at, result: "skipped" });
        continue;
      }

      if (requested) await deps.pause();
      requested = true;
      const { page: fetched, status } = await deps.fetchPage(page.url);
      if (!fetched.ok) {
        if (status === 403 || status === 429) {
          for (const store of claimed) await blockFetch(store.db, store.storeId, now).catch(() => {});
          summary.blocked += claimed.length;
          deps.log("offers_job_page", { ...at, result: "blocked", status });
        } else {
          summary.failed += claimed.length;
          deps.log("offers_job_page", { ...at, result: fetched.error.code });
        }
        continue;
      }

      const offers = read(fetched.data.html, now);
      if (!offers.ok) {
        if (offers.error.code === "offers_none") summary.none += claimed.length;
        else summary.failed += claimed.length;
        deps.log("offers_job_page", { ...at, result: offers.error.code, skipped: offers.error.skipped });
        continue;
      }
      const weeks = offers.data.weeks;
      deps.log("offers_job_page", { ...at, result: "read", weeks: weeks.length, offers: weeks.at(-1)?.entries.length ?? 0, skipped: offers.data.skipped });
      for (const store of claimed) await saveFor(store, offers.data, deps, summary, at);
    }
  } finally {
    for (const session of sessions.values()) {
      await session.then((open) => open.signOut()).catch(() => {});
    }
  }

  deps.log("offers_job_done", { ...summary });
  return summary;
}

async function saveFor(
  store: { storeId: string; db: Db },
  read: OfferPageRead,
  deps: JobDeps,
  summary: JobSummary,
  at: { page: number; of: number },
) {
  try {
    const saved = await saveOfferPageIn(store.db, { storeId: store.storeId, read }, deps.catalogFor(store.db));
    if (saved.ok) {
      summary.saved++;
      summary.offers += saved.data.saved;
      deps.log("offers_job_store", { ...at, result: "saved", saved: saved.data.saved, matched: saved.data.matched });
    } else {
      summary.failed++;
      deps.log("offers_job_store", { ...at, result: saved.error.code });
    }
  } catch {
    // The catalog could not be read; nothing was saved for this store.
    summary.failed++;
    deps.log("offers_job_store", { ...at, result: "catalog_unavailable" });
  }
}

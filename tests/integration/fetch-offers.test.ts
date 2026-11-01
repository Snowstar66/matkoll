import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchIngredientsIn } from "@/features/catalog/actions/match-ingredients";
import { loadIngredientSummaries } from "@/features/catalog/data/queries";
import { addDays, weekStartOf } from "@/features/offers";
import { blockFetch, claimFetch, loadActiveOffers } from "@/features/offers/data/queries";
import { OFFER_SITE_DOMAINS } from "@/features/settings";
import { fillFixtureDates, fixtureSites } from "@/server/fetch/fixture-sites";
import { ok } from "@/lib/errors";
import { fetchOfferPageWith } from "@/server/fetch/offer-page";
import { loadStoreRows, runOffersJob, signInAs, type JobDeps } from "../../scripts/fetch-offers/job.ts";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// Story 17.11: the scheduled fetch against local Supabase, with the saved test
// pages in tests/fixtures/sites instead of the network. It lists the test
// users' stores with the service role, signs in as each owner, fetches each
// page once and saves the offers as the in-app fetch does: the rows, the
// matched ingredient, and the attempt on the store.

const link = (slug: string) => `https://www.ica.se/erbjudanden/${slug}/`;
const shared = link("matkoll-test-butik-1000001");
const refused = link("matkoll-test-nekad-1000005");
const minute = 60_000;

let unique = 0;

async function addStore(db: Db, offersUrl: string | null): Promise<string> {
  const { data, error } = await db
    .from("store")
    .insert({ name: `Jobbutik ${unique++}`, chain: "ICA", offers_url: offersUrl })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function attemptedAt(storeId: string): Promise<Date | null> {
  const { data, error } = await adminClient().from("store").select("offers_attempted_at").eq("id", storeId).single();
  if (error) throw error;
  return data.offers_attempted_at ? new Date(data.offers_attempted_at) : null;
}

async function offersOf(storeId: string) {
  const { data, error } = await adminClient()
    .from("store_offer")
    .select("user_id, label, ingredient_id, section, source, week_start")
    .eq("store_id", storeId)
    .order("created_at");
  if (error) throw error;
  return data;
}

let a: TestUser;
let b: TestUser;
let c: TestUser;
let stores: { a: string; b: string; refused: string; none: string };
let laxfile: string;
const requests: string[] = [];
const logs: [string, Record<string, string | number>][] = [];

function deps(now = new Date()): JobDeps {
  const sites = fixtureSites();
  const admin = adminClient();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  return {
    // Only this run's users: the job never touches anyone else's stores here.
    listStores: () => loadStoreRows(admin, { userIds: [a.id, b.id, c.id] }),
    signIn: (userId) => signInAs(admin, { url: localSupabaseUrl(), publishableKey }, userId),
    fetchPage: (url) =>
      fetchOfferPageWith(url, {
        allowedDomains: OFFER_SITE_DOMAINS,
        signal: new AbortController().signal,
        lookup: sites.lookup,
        fetchImpl: (target, init) => {
          requests.push(target.href);
          return sites.fetchImpl(target, init);
        },
      }),
    catalogFor: (db) => ({ match: (items) => matchIngredientsIn(db, items), summaries: (ids) => loadIngredientSummaries(db, ids) }),
    now: () => now,
    pause: async () => {},
    log: (event, fields) => void logs.push([event, fields]),
  };
}

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("offers-job-a");
  b = await createTestUser("offers-job-b");
  c = await createTestUser("offers-job-c");
  const ingredient = await a.db
    .from("ingredient")
    .insert({ name: "laxfilé", normalized_name: "laxfilé", section: "Kött och fisk", location: "Frys" })
    .select("id")
    .single();
  if (ingredient.error) throw ingredient.error;
  laxfile = ingredient.data.id;
  stores = {
    a: await addStore(a.db, shared),
    b: await addStore(b.db, shared),
    refused: await addStore(c.db, refused),
    none: await addStore(c.db, null),
  };
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("the scheduled offers fetch (Story 17.11)", () => {
  it("fetches each page once and saves the offers for every owner, through their own session", async () => {
    const now = new Date();
    const summary = await runOffersJob(deps(now));

    // Two users share one page: one request. The refused page is asked once too.
    expect(requests.filter((url) => url === shared)).toHaveLength(1);
    expect(requests.filter((url) => url === refused)).toHaveLength(1);
    expect(summary).toMatchObject({ pages: 2, stores: 3, saved: 2, offers: 14, blocked: 1, failed: 0, recently: 0 });

    const week = weekStartOf(now);
    const ofA = await offersOf(stores.a);
    const ofB = await offersOf(stores.b);
    expect(ofA).toHaveLength(7);
    expect(ofB).toHaveLength(7);
    expect(ofA.every((row) => row.user_id === a.id && row.source === "link" && row.week_start === week)).toBe(true);
    expect(ofB.every((row) => row.user_id === b.id)).toBe(true);
    // Matched against each owner's own catalog: only A has laxfilé.
    expect(ofA.find((row) => row.label === "Havets Laxfilé")).toMatchObject({ ingredient_id: laxfile, section: "Kött och fisk" });
    expect(ofB.find((row) => row.label === "Havets Laxfilé")).toMatchObject({ ingredient_id: null });
    expect(await offersOf(stores.refused)).toEqual([]);

    // The attempts are on the stores, as after a tap in the app; the refused store is blocked for 6 hours.
    expect((await attemptedAt(stores.a))?.getTime()).toBe(now.getTime());
    expect((await attemptedAt(stores.b))?.getTime()).toBe(now.getTime());
    expect((await attemptedAt(stores.refused))!.getTime()).toBeGreaterThan(now.getTime() + 5 * 60 * minute);
    expect(await attemptedAt(stores.none)).toBeNull();

    // The sessions are gone again, and the log names no store, user or address.
    const text = JSON.stringify(logs);
    for (const secret of [a.id, b.id, c.id, stores.a, stores.b, "ica.se", "matkoll-test", "Laxfilé"]) expect(text).not.toContain(secret);
  });

  it("runs again without a duplicate, and leaves a store fetched in the last 15 minutes alone", async () => {
    requests.length = 0;
    const soon = new Date(Date.now() + 5 * minute);
    const summary = await runOffersJob(deps(soon));
    // The fetched stores wait; the refused one is asked again, since a run looks past a block (a run by hand after a refusal).
    expect(requests).toEqual([refused]);
    expect(summary).toMatchObject({ saved: 0, recently: 2, blocked: 1 });

    const later = new Date(Date.now() + 20 * minute);
    const again = await runOffersJob(deps(later));
    expect(requests.filter((url) => url === shared)).toHaveLength(1);
    expect(again).toMatchObject({ saved: 2 });
    expect(await offersOf(stores.a)).toHaveLength(7);
  });

  it("is not stopped by a block that the app's server got, but the app still is", async () => {
    const store = await addStore(a.db, null);
    const now = new Date();
    expect(await claimFetch(a.db, store, now)).toBe(true);
    await blockFetch(a.db, store, now);
    const later = new Date(now.getTime() + 20 * minute);
    expect(await claimFetch(a.db, store, later)).toBe(false);
    expect(await claimFetch(a.db, store, later, { pastBlock: true })).toBe(true);
    // Its own claim counts as an attempt: 15 minutes for everyone.
    expect(await claimFetch(a.db, store, new Date(later.getTime() + 5 * minute), { pastBlock: true })).toBe(false);
  });

  it("saves next week too once its offers are on the page, and a rerun updates without duplicates", async () => {
    const store = await addStore(a.db, shared);
    // One more offer ends next Sunday: 4 end this week, 3 last into next week, so next week's are out.
    let first = true;
    const html = fillFixtureDates(
      readFileSync("tests/fixtures/sites/ica-erbjudanden.html", "utf8").replace(/"validTo":"\{\{sunday\}\}/g, (mark) => {
        if (!first) return mark;
        first = false;
        return '"validTo":"{{sunday+7}}';
      }),
    );
    const run = (at: Date) =>
      runOffersJob({
        ...deps(at),
        listStores: async () => [{ id: store, user_id: a.id, chain: "ICA", offers_url: shared }],
        fetchPage: async (url) => ({ page: ok({ url, html }), status: 200 }),
      });
    const now = new Date();
    expect(await run(now)).toMatchObject({ saved: 1, failed: 0 });
    const thisWeek = weekStartOf(now);
    const nextWeek = addDays(thisWeek, 7);
    const weeks = async () => {
      const rows = await offersOf(store);
      return [thisWeek, nextWeek].map((week) => rows.filter((row) => row.week_start === week).length);
    };
    expect(await weeks()).toEqual([7, 3]);
    // The sheet shows the newest week: next week's.
    const active = await loadActiveOffers(a.db, store, now);
    expect(new Set(active.map((offer) => offer.weekStart))).toEqual(new Set([nextWeek]));

    // A run 20 minutes later updates both weeks and adds nothing.
    expect(await run(new Date(now.getTime() + 20 * minute))).toMatchObject({ saved: 1 });
    expect(await weeks()).toEqual([7, 3]);
  });
});

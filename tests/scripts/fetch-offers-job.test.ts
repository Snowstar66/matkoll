import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { fillFixtureDates } from "@/server/fetch/fixture-sites";
import type { OfferPageFetch } from "@/server/fetch/offer-page";

// Story 17.11: the scheduled fetch's run with every outside part replaced:
// the stores, the sessions, the request and the save. The real run against
// local Supabase is in tests/integration/fetch-offers.test.ts.

const claimFetch = vi.fn();
const blockFetch = vi.fn();
vi.mock("@/features/offers/data/queries", () => ({
  claimFetch: (...args: unknown[]) => claimFetch(...args),
  blockFetch: (...args: unknown[]) => blockFetch(...args),
}));
const saveOfferPageIn = vi.fn();
vi.mock("@/features/offers/actions/save-offer-page", () => ({ saveOfferPageIn: (...args: unknown[]) => saveOfferPageIn(...args) }));

const { runOffersJob } = await import("../../scripts/fetch-offers/job.ts");
type Deps = Parameters<typeof runOffersJob>[0];

const link = (slug: string) => `https://www.ica.se/erbjudanden/${slug}/`;
const maxi = link("matkoll-test-butik-1000001");
const krokom = link("matkoll-test-krokom-1000013");
const page = fillFixtureDates(readFileSync("tests/fixtures/sites/ica-erbjudanden.html", "utf8"));

type Row = { id: string; user_id: string; chain: string; offers_url: string | null };
let rows: Row[];
let fetched: string[];
let answers: Map<string, OfferPageFetch>;
let signedIn: string[];
let signedOut: string[];
let pauses: number;
let logs: [string, Record<string, string | number>][];

function deps(changes: Partial<Deps> = {}): Deps {
  return {
    listStores: async () => rows.filter((row) => row.offers_url !== null),
    signIn: async (userId) => {
      signedIn.push(userId);
      return { db: { user: userId } as never, signOut: async () => void signedOut.push(userId) };
    },
    fetchPage: async (url) => {
      fetched.push(url);
      return answers.get(url) ?? { page: ok({ url, html: page }), status: 200 };
    },
    catalogFor: () => ({ match: async () => [], summaries: async () => ({}) }),
    now: () => new Date(),
    pause: async () => void pauses++,
    log: (event, fields) => void logs.push([event, fields]),
    ...changes,
  };
}

beforeEach(() => {
  rows = [
    { id: "s1", user_id: "user-a", chain: "ICA", offers_url: maxi },
    { id: "s2", user_id: "user-b", chain: "ICA", offers_url: maxi },
    { id: "s3", user_id: "user-a", chain: "ICA", offers_url: krokom },
    { id: "s4", user_id: "user-c", chain: "ICA", offers_url: null },
    { id: "s5", user_id: "user-c", chain: "Willys", offers_url: "https://www.willys.se/butik/1" },
  ];
  fetched = [];
  answers = new Map();
  signedIn = [];
  signedOut = [];
  pauses = 0;
  logs = [];
  claimFetch.mockReset().mockResolvedValue(true);
  blockFetch.mockReset().mockResolvedValue(undefined);
  saveOfferPageIn.mockReset().mockResolvedValue(ok({ saved: 7, matched: 1, withRegularPrice: 3 }));
});

describe("runOffersJob", () => {
  it("fetches each page once, one after the other with a pause, and saves it for every store that has it", async () => {
    const summary = await runOffersJob(deps());
    // In the order of the addresses ("butik" before "krokom").
    expect(fetched).toEqual([maxi, krokom]);
    expect(pauses).toBe(1);
    expect(saveOfferPageIn.mock.calls.map((call) => call[1].storeId)).toEqual(["s1", "s2", "s3"]);
    // Each store is saved through its owner's session, with the page read once for the week.
    expect(saveOfferPageIn.mock.calls.map((call) => call[0])).toEqual([{ user: "user-a" }, { user: "user-b" }, { user: "user-a" }]);
    expect(saveOfferPageIn.mock.calls[0][1].read).toMatchObject({ skipped: 2 });
    expect(saveOfferPageIn.mock.calls[0][1].read.weeks).toHaveLength(1);
    expect(saveOfferPageIn.mock.calls[0][1].read.weeks[0].entries).toHaveLength(7);
    // The same read page for every store: read once.
    expect(saveOfferPageIn.mock.calls[1][1].read).toBe(saveOfferPageIn.mock.calls[0][1].read);
    expect(summary).toMatchObject({ pages: 2, stores: 3, saved: 3, offers: 21, blocked: 0, failed: 0, withoutLink: 0, unsupported: 1 });
  });

  it("signs in once per user and signs every session out at the end", async () => {
    await runOffersJob(deps());
    expect(signedIn.sort()).toEqual(["user-a", "user-b"]);
    expect(signedOut.sort()).toEqual(["user-a", "user-b"]);
  });

  it("claims each store before the request, past a block set by the app's server, and leaves one fetched just now alone", async () => {
    claimFetch.mockImplementation(async (_db, storeId) => storeId !== "s2");
    const summary = await runOffersJob(deps());
    expect(claimFetch.mock.calls.map((call) => [call[1], call[3]])).toEqual([
      ["s1", { pastBlock: true }],
      ["s2", { pastBlock: true }],
      ["s3", { pastBlock: true }],
    ]);
    expect(saveOfferPageIn.mock.calls.map((call) => call[1].storeId)).toEqual(["s1", "s3"]);
    expect(summary).toMatchObject({ saved: 2, recently: 1 });
  });

  it("does not request a page whose stores were all fetched just now", async () => {
    claimFetch.mockResolvedValue(false);
    const summary = await runOffersJob(deps());
    expect(fetched).toEqual([]);
    expect(summary).toMatchObject({ saved: 0, recently: 3 });
  });

  it("blocks every store of a page that answers 403 or 429, and goes on with the next page", async () => {
    answers.set(maxi, { page: fail("fetch_blocked"), status: 403 });
    const summary = await runOffersJob(deps());
    expect(blockFetch.mock.calls.map((call) => call[1])).toEqual(["s1", "s2"]);
    expect(fetched).toEqual([maxi, krokom]);
    expect(summary).toMatchObject({ blocked: 2, saved: 1 });
    expect(logs).toContainEqual(["offers_job_page", { page: 1, of: 2, result: "blocked", status: 403 }]);
  });

  it("counts a page that failed or changed shape, and saves nothing from it", async () => {
    answers.set(krokom, { page: fail("fetch_timeout"), status: null });
    answers.set(maxi, { page: ok({ url: maxi, html: "<html><body>Inga erbjudanden</body></html>" }), status: 200 });
    const summary = await runOffersJob(deps());
    expect(saveOfferPageIn).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ failed: 3, saved: 0 });
  });

  it("goes on when a user cannot be signed in or a save fails", async () => {
    saveOfferPageIn.mockImplementation(async (_db, input) => (input.storeId === "s1" ? fail("offers_failed") : ok({ saved: 7, matched: 0, withRegularPrice: 0 })));
    const summary = await runOffersJob(
      deps({
        signIn: async (userId) => {
          if (userId === "user-b") throw new Error("offers_job_sign_in_failed");
          return { db: { user: userId } as never, signOut: async () => {} };
        },
      }),
    );
    expect(saveOfferPageIn.mock.calls.map((call) => call[1].storeId)).toEqual(["s1", "s3"]);
    expect(summary).toMatchObject({ saved: 1, failed: 2 });
  });

  it("logs codes and counts only: no address, store, user or offer", async () => {
    answers.set(krokom, { page: fail("fetch_blocked"), status: 429 });
    await runOffersJob(deps());
    const text = JSON.stringify(logs);
    for (const secret of ["ica.se", "matkoll-test", "s1", "s2", "s3", "user-a", "user-b", "Laxfilé", "kr/kg"]) {
      expect(text).not.toContain(secret);
    }
    expect(logs.at(-1)?.[0]).toBe("offers_job_done");
  });

  it("counts a page that still shows last week as stale, not as a failure (Story 17.11)", async () => {
    const old = readFileSync("tests/fixtures/sites/ica-erbjudanden-gammal.html", "utf8");
    answers.set(maxi, { page: ok({ url: maxi, html: fillFixtureDates(old) }), status: 200 });
    const summary = await runOffersJob(deps());
    expect(summary).toMatchObject({ stale: 2, failed: 0, blocked: 0, saved: 1 });
  });

  it("counts a week the database refuses as stale too", async () => {
    saveOfferPageIn.mockResolvedValue(fail("offers_page_old"));
    expect(await runOffersJob(deps())).toMatchObject({ stale: 3, failed: 0 });
  });

  it("leaves a banned user's stores alone", async () => {
    const summary = await runOffersJob(deps({ signIn: async (userId) => (userId === "user-b" ? null : { db: { user: userId } as never, signOut: async () => {} }) }));
    expect(saveOfferPageIn.mock.calls.map((call) => call[1].storeId)).toEqual(["s1", "s3"]);
    expect(summary).toMatchObject({ banned: 1, failed: 0, saved: 2 });
  });

  it("logs a session it could not end, and still finishes", async () => {
    const summary = await runOffersJob(
      deps({ signIn: async () => ({ db: {} as never, signOut: async () => Promise.reject(new Error("offers_job_sign_out_failed")) }) }),
    );
    expect(summary.saved).toBe(3);
    expect(logs.filter(([event]) => event === "offers_job_sign_out_failed")).toHaveLength(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientMatch, MatchItem } from "@/features/catalog";
import type { Store } from "@/features/settings";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import type { OfferDraft } from "../domain/offer";
import { addDays, weekStartOf } from "../domain/week";

// fetchStoreOffers with the fetch port on the saved pages in
// tests/fixtures/sites (AI_PROVIDER=mock and a local SITE_URL, as in E2E and
// CI): no request leaves the machine, and ica.se is never called. The user
// check, settings, the catalog and the database are stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));

const { SettingsDataError, CatalogDataError } = vi.hoisted(() => ({
  SettingsDataError: class SettingsDataError extends Error {
    constructor(readonly detail: string) {
      super(`settings_data: ${detail}`);
    }
  },
  CatalogDataError: class CatalogDataError extends Error {},
}));
const listStores = vi.fn<() => Promise<Store[]>>();
vi.mock("@/features/settings/server", () => ({ SettingsDataError, listStores: () => listStores() }));

const matchIngredients = vi.fn<(items: readonly MatchItem[]) => Promise<IngredientMatch[]>>();
const getIngredientSummaries = vi.fn();
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  matchIngredients: (items: readonly MatchItem[]) => matchIngredients(items),
  getIngredientSummaries: (ids: readonly string[]) => getIngredientSummaries(ids),
}));

const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));

const claimFetch = vi.fn<(db: unknown, storeId: string, now: Date) => Promise<boolean>>();
const blockFetch = vi.fn<(db: unknown, storeId: string, now: Date) => Promise<void>>();
vi.mock("../data/queries", () => ({
  claimFetch: (...args: Parameters<typeof claimFetch>) => claimFetch(...args),
  blockFetch: (...args: Parameters<typeof blockFetch>) => blockFetch(...args),
}));
const saveOffersIn = vi.fn<(db: unknown, input: { storeId: string; weekStart: string; items: OfferDraft[]; replaceSource?: string }) => Promise<Result<number>>>();
vi.mock("../data/save", () => ({ saveOffersIn: (...args: Parameters<typeof saveOffersIn>) => saveOffersIn(...args) }));

// The fetch port reads the saved pages; every call to it is counted.
vi.mock("@/server/env", () => ({ env: { AI_PROVIDER: "mock", SITE_URL: "http://localhost:3100" } }));
const fetchCalls: string[] = [];
/** When set, the fetch port answers with this page instead of a saved one. */
let pageOverride: string | null = null;
const requests: string[] = [];
vi.mock("@/server/fetch", async (importOriginal) => {
  const port = await importOriginal<typeof import("@/server/fetch")>();
  return {
    ...port,
    fetchOfferPage: async (url: string, options: Parameters<typeof port.fetchOfferPage>[1]) => {
      fetchCalls.push(url);
      if (pageOverride !== null) return { page: ok({ html: pageOverride, finalUrl: url }), status: 200 };
      return port.fetchOfferPage(url, options);
    },
  };
});
vi.mock("@/server/fetch/fixture-sites", async (importOriginal) => {
  const sites = await importOriginal<typeof import("@/server/fetch/fixture-sites")>();
  return {
    ...sites,
    fixtureSites: () => {
      const real = sites.fixtureSites();
      return {
        lookup: real.lookup,
        fetchImpl: (url: URL, init: Parameters<typeof real.fetchImpl>[1]) => {
          requests.push(url.href);
          return real.fetchImpl(url, init);
        },
      };
    },
  };
});

const { fetchStoreOffers } = await import("./fetch-store-offers");

const storeId = "11111111-1111-4111-8111-111111111111";
const laxfile = "22222222-2222-4222-8222-222222222222";
const linkOf = (slug: string) => `https://www.ica.se/erbjudanden/${slug}/`;
const fixtureLink = linkOf("matkoll-test-butik-1000001");

function storeWith(offersUrl: string | null, changes: Partial<Store> = {}): Store {
  return {
    id: storeId,
    name: "Matkoll Testbutik",
    chain: "ICA",
    externalStoreId: "1000001",
    address: null,
    url: null,
    offersUrl,
    isSelected: true,
    ...changes,
  };
}

let logs: unknown[][];

beforeEach(() => {
  fetchCalls.length = 0;
  requests.length = 0;
  logs = [];
  for (const level of ["error", "info", "warn", "log"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
  }
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  listStores.mockReset().mockResolvedValue([storeWith(fixtureLink)]);
  pageOverride = null;
  claimFetch.mockReset().mockResolvedValue(true);
  blockFetch.mockReset().mockResolvedValue(undefined);
  saveOffersIn.mockReset().mockImplementation(async (_db, input) => ok(input.items.length));
  revalidateFor.mockReset();
  // Laxfilé is in the catalog; nothing else is.
  matchIngredients.mockReset().mockImplementation(async (items) =>
    items.map(
      (item): IngredientMatch =>
        item.text === "laxfilé"
          ? { kind: "match", ingredientId: laxfile, confidence: "exact" }
          : { kind: "new", proposal: { name: item.text, section: "Övrigt", location: "Skafferi", defaultUnit: null } },
    ),
  );
  getIngredientSummaries.mockReset().mockResolvedValue({ [laxfile]: { name: "Laxfilé", section: "Kött och fisk" } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const codeOf = (result: Result<unknown>) => (result.ok ? null : result.error.code);

describe("fetchStoreOffers", () => {
  it("fetches the page once, saves the 7 offers on food for the week and counts the 2 that are not", async () => {
    const result = await fetchStoreOffers({ storeId });
    const weekStart = weekStartOf(new Date());
    expect(result).toEqual(ok({ saved: 7, skipped: 2, matched: 1, weekStart }));
    expect(fetchCalls).toEqual([fixtureLink]);
    expect(requests).toEqual([fixtureLink]);
    expect(saveOffersIn).toHaveBeenCalledTimes(1);
    const input = saveOffersIn.mock.calls[0][1];
    expect(input).toMatchObject({ storeId, weekStart, replaceSource: "link" });
    expect(input.items.map((item) => item.label)).toEqual([
      "Gårdens Herrgård, Präst",
      "Havets Laxfilé",
      "Bondens Krossade tomater",
      "Mejerigården Mellanmjölk",
      "Odlarna Gul lök",
      "Bageriet Rågbröd",
      "Frostens Frysta ärter",
    ]);
    expect(revalidateFor).toHaveBeenCalledWith("store_offer");
  });

  it("links an offer in the catalog, and keeps one outside it without a catalog ingredient", async () => {
    await fetchStoreOffers({ storeId });
    const [herrgard, lax] = saveOffersIn.mock.calls[0][1].items;
    expect(herrgard).toMatchObject({
      label: "Gårdens Herrgård, Präst",
      name: "herrgård",
      ingredientId: null,
      section: "Kött och fisk",
      price: "89 kr/kg",
      note: "Max 1 köp/hushåll",
      memberOnly: true,
      source: "link",
    });
    expect(lax).toMatchObject({ name: "laxfilé", ingredientId: laxfile, section: "Kött och fisk", memberOnly: false });
    // One call to the catalog for every name of every offer; it never writes.
    expect(matchIngredients).toHaveBeenCalledTimes(1);
  });

  it("never lets the page's token, cookie or session id reach the answer, the database or the logs", async () => {
    const result = await fetchStoreOffers({ storeId });
    const everything = JSON.stringify([result, saveOffersIn.mock.calls.map((call) => call[1]), logs]);
    for (const secret of ["inte-en-riktig-nyckel", "inte-en-riktig-kaka", "inte-ett-riktigt-sessions-id", "publicAccessToken"]) {
      expect(everything).not.toContain(secret);
    }
    // The logs hold counts only: no address, item or price.
    expect(JSON.stringify(logs)).not.toMatch(/ica\.se|Herrgård|kr\/kg/);
    expect(logs).toContainEqual(["offers_fetched", { saved: 7, skipped: 2, matched: 1, withRegularPrice: 3 }]);
  });

  it.each([
    ["matkoll-test-nekad-1000005", 403],
    ["matkoll-test-for-manga-1000006", 429],
  ])("gives offers_fetch_blocked after one request to %s (%i), and never tries again", async (slug) => {
    listStores.mockResolvedValue([storeWith(linkOf(slug))]);
    expect(await fetchStoreOffers({ storeId })).toEqual(fail("offers_fetch_blocked"));
    expect(requests).toEqual([linkOf(slug)]);
    expect(fetchCalls).toHaveLength(1);
    expect(saveOffersIn).not.toHaveBeenCalled();
    expect(errorMessages.offers_fetch_blocked).toContain("Öppna sidan");
  });

  it.each([
    ["a page without data", "matkoll-test-utan-data-1000002", "offers_page_changed"],
    ["a link that moved to the start page", "matkoll-test-flyttad-1000010", "offers_page_changed"],
    ["an empty week", "matkoll-test-tom-1000003", "offers_none"],
    ["a week that is over", "matkoll-test-gammal-1000004", "offers_page_old"],
    ["another status", "matkoll-test-serverfel-1000007", "offers_fetch_failed"],
    ["a page that is too large", "matkoll-test-for-stor-1000008", "offers_fetch_failed"],
    ["a redirect to another host", "matkoll-test-annan-sajt-1000011", "offers_fetch_failed"],
  ])("gives the right code for %s and saves nothing", async (_name, slug, code) => {
    listStores.mockResolvedValue([storeWith(linkOf(slug))]);
    expect(codeOf(await fetchStoreOffers({ storeId }))).toBe(code);
    expect(fetchCalls).toHaveLength(1);
    expect(saveOffersIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("does not follow a redirect to another host", async () => {
    listStores.mockResolvedValue([storeWith(linkOf("matkoll-test-annan-sajt-1000011"))]);
    await fetchStoreOffers({ storeId });
    expect(requests).toEqual([linkOf("matkoll-test-annan-sajt-1000011")]);
  });

  it("gives offers_none when nothing on the page is food, and logs only the count", async () => {
    listStores.mockResolvedValue([storeWith(linkOf("matkoll-test-bara-annat-1000012"))]);
    expect(await fetchStoreOffers({ storeId })).toEqual(fail("offers_none"));
    expect(logs).toContainEqual(["offers_none", { skipped: 2 }]);
    expect(saveOffersIn).not.toHaveBeenCalled();
  });

  it("refuses a fetch the claim throttles, without fetching, and claims before every fetch", async () => {
    claimFetch.mockResolvedValue(false);
    expect(await fetchStoreOffers({ storeId })).toEqual(fail("offers_fetched_recently"));
    expect(fetchCalls).toEqual([]);

    claimFetch.mockResolvedValue(true);
    expect((await fetchStoreOffers({ storeId })).ok).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(claimFetch).toHaveBeenLastCalledWith(db, storeId, expect.any(Date));
    expect(blockFetch).not.toHaveBeenCalled();
  });

  it("claims also for a page that fails, and blocks for 6 hours after a 403 or 429 only", async () => {
    listStores.mockResolvedValue([storeWith(linkOf("matkoll-test-nekad-1000005"))]);
    await fetchStoreOffers({ storeId });
    expect(claimFetch).toHaveBeenCalledTimes(1);
    expect(blockFetch).toHaveBeenCalledWith(db, storeId, expect.any(Date));

    blockFetch.mockClear();
    listStores.mockResolvedValue([storeWith(linkOf("matkoll-test-serverfel-1000007"))]);
    await fetchStoreOffers({ storeId });
    expect(claimFetch).toHaveBeenCalledTimes(2);
    expect(blockFetch).not.toHaveBeenCalled();
  });

  describe("on a page written here", () => {
    const day = addDays(weekStartOf(new Date()), 6);
    const entry = (name: string, fields: Record<string, unknown> = {}) => ({
      details: { brand: "", name, mechanicInfo: "10 kr" },
      category: { articleGroupName: "Skafferivaror" },
      validTo: `${day}T00:00:00`,
      restriction: "",
      ...fields,
    });
    const pageOf = (entries: unknown[]) =>
      `<html><body><script>window.__INITIAL_DATA__ = ${JSON.stringify({ offers: { weeklyOffers: entries } })};</script></body></html>`;

    it("cuts the food offers to 300 before matching and counts the rest as skipped", async () => {
      pageOverride = pageOf(Array.from({ length: 305 }, (_, index) => entry(`Vara ${index}`)));
      const result = await fetchStoreOffers({ storeId });
      expect(result.ok && result.data).toMatchObject({ saved: 300, skipped: 5 });
      expect(saveOffersIn.mock.calls[0][1].items).toHaveLength(300);
      // One candidate list per kept offer: nothing past the 300th is looked up.
      const asked = matchIngredients.mock.calls[0][0].map((item) => item.text);
      expect(asked).not.toContain("vara 300");
      expect(asked).toContain("vara 299");
    });

    it("leaves out an offer whose label is empty once cleaned, and saves the others", async () => {
      pageOverride = pageOf([entry("\u00ae"), entry("Gul lök")]);
      const result = await fetchStoreOffers({ storeId });
      expect(result.ok && result.data).toMatchObject({ saved: 1, skipped: 1 });
      expect(saveOffersIn.mock.calls[0][1].items.map((item) => item.label)).toEqual(["Gul lök"]);
    });

    it("gives offers_none when every offer is empty once cleaned", async () => {
      pageOverride = pageOf([entry("\u00ae")]);
      expect(await fetchStoreOffers({ storeId })).toEqual(fail("offers_none"));
      expect(saveOffersIn).not.toHaveBeenCalled();
    });

    it("does not let one impossible date fail the save", async () => {
      pageOverride = pageOf([entry("Spöke", { validTo: "2026-02-30T00:00:00" }), entry("Gul lök")]);
      const result = await fetchStoreOffers({ storeId });
      expect(result.ok && result.data.saved).toBe(1);
    });
  });

  it.each([
    ["no link", storeWith(null), "offers_link_missing"],
    ["a link that is not an offer page", storeWith("https://www.ica.se/recept/kladdkaka-1/"), "offers_link_unsupported"],
    ["a chain without an offer site", storeWith(fixtureLink, { chain: "Willys" }), "offers_link_unsupported"],
  ])("gives the right code for a store with %s, without fetching", async (_name, store, code) => {
    listStores.mockResolvedValue([store]);
    expect(codeOf(await fetchStoreOffers({ storeId }))).toBe(code);
    expect(fetchCalls).toEqual([]);
  });

  it("fetches nothing for another user's store, or an id that is not one", async () => {
    listStores.mockResolvedValue([]);
    expect(await fetchStoreOffers({ storeId })).toEqual(fail("offers_store_missing"));
    expect(await fetchStoreOffers({ storeId: "inte-ett-id" })).toEqual(fail("validation"));
    expect(fetchCalls).toEqual([]);
  });

  it("returns unauthorized without a user, before reading anything", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await fetchStoreOffers({ storeId })).toEqual(fail("unauthorized"));
    expect(listStores).not.toHaveBeenCalled();
    expect(fetchCalls).toEqual([]);
  });

  it("passes on what saving refuses", async () => {
    saveOffersIn.mockResolvedValue(fail("offers_limit"));
    expect(await fetchStoreOffers({ storeId })).toEqual(fail("offers_limit"));
    expect(revalidateFor).not.toHaveBeenCalled();
    saveOffersIn.mockResolvedValue(fail("offers_week_invalid"));
    expect(await fetchStoreOffers({ storeId })).toEqual(fail("offers_page_old"));
  });

  it("says when the stores or the catalog cannot be read", async () => {
    listStores.mockRejectedValue(new SettingsDataError("query_failed 500"));
    expect(codeOf(await fetchStoreOffers({ storeId }))).toBe("settings_store_unavailable");
    listStores.mockResolvedValue([storeWith(fixtureLink)]);
    matchIngredients.mockRejectedValue(new CatalogDataError());
    expect(codeOf(await fetchStoreOffers({ storeId }))).toBe("catalog_unavailable");
  });
});

import { describe, expect, it } from "vitest";
import { planOfferFetches, type StoreRow } from "../../scripts/fetch-offers/plan.ts";

// Story 17.11: which pages the scheduled fetch asks for, and for which stores.

const link = (slug: string) => `https://www.ica.se/erbjudanden/${slug}/`;
let next = 0;
const row = (changes: Partial<StoreRow> = {}): StoreRow => ({
  id: `store-${next++}`,
  user_id: "user-a",
  chain: "ICA",
  offers_url: link("maxi-ica-stormarknad-ostersund-1003733"),
  ...changes,
});

describe("planOfferFetches", () => {
  it("plans one page per store with a link, with its site's host", () => {
    const store = row();
    expect(planOfferFetches([store])).toEqual({
      pages: [{ url: store.offers_url, host: "www.ica.se", stores: [{ storeId: store.id, userId: "user-a" }] }],
      withoutLink: 0,
      unsupported: 0,
    });
  });

  it("fetches a page once when several users, or several stores, have the same link", () => {
    const a = row({ user_id: "user-a" });
    const b = row({ user_id: "user-b" });
    // The same page typed without the trailing "/" and in another case of the host.
    const c = row({ user_id: "user-c", offers_url: "https://WWW.ICA.SE/erbjudanden/maxi-ica-stormarknad-ostersund-1003733" });
    const other = row({ user_id: "user-a", offers_url: link("ica-kvantum-krokom-1004222") });
    const plan = planOfferFetches([a, b, c, other]);
    expect(plan.pages.map((page) => page.url)).toEqual([link("ica-kvantum-krokom-1004222"), link("maxi-ica-stormarknad-ostersund-1003733")]);
    expect(plan.pages[1].stores).toEqual([
      { storeId: a.id, userId: "user-a" },
      { storeId: b.id, userId: "user-b" },
      { storeId: c.id, userId: "user-c" },
    ]);
    expect(plan.pages[0].stores).toEqual([{ storeId: other.id, userId: "user-a" }]);
  });

  it("skips a store without a link, and counts it", () => {
    const plan = planOfferFetches([row({ offers_url: null }), row({ offers_url: "" })]);
    expect(plan).toEqual({ pages: [], withoutLink: 2, unsupported: 0 });
  });

  it("skips a link the app would not fetch either: another site, another chain, or not a store page", () => {
    const plan = planOfferFetches([
      row({ offers_url: "https://www.willys.se/erbjudanden/butik/1234" }),
      row({ chain: "Willys" }),
      row({ offers_url: "https://www.ica.se/recept/" }),
      row({ offers_url: "http://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/" }),
    ]);
    expect(plan).toEqual({ pages: [], withoutLink: 0, unsupported: 4 });
  });

  it("lists a store once even if its row comes twice", () => {
    const store = row();
    expect(planOfferFetches([store, store]).pages[0].stores).toHaveLength(1);
  });
});

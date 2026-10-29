import { describe, expect, it } from "vitest";
import { fail } from "@/lib/errors";
import emptyPage from "../../../../tests/fixtures/sites/ica-erbjudanden-tom.html?raw";
import noDataPage from "../../../../tests/fixtures/sites/ica-erbjudanden-utan-data.html?raw";
import savedPage from "../../../../tests/fixtures/sites/ica-erbjudanden.html?raw";
import readerSource from "./ica-offer-page.ts?raw";
import { FOOD_CATEGORIES, foodSection, parseIcaOfferPage } from "./ica-offer-page";
import { addDays } from "./week";

// The reader of ICA's offer page against the saved pages in tests/fixtures/sites
// (made-up items in the page's shape) and small pages written here. The
// pages come in as `?raw` imports: a domain test does no I/O of its own (AD-1).

const pages: Record<string, string> = {
  "ica-erbjudanden.html": savedPage,
  "ica-erbjudanden-tom.html": emptyPage,
  "ica-erbjudanden-utan-data.html": noDataPage,
};

/** The saved page with its days set as for Wednesday 28 October 2026 (week 44, Sunday 1 November), as fixture-sites.ts does. */
const fixture = (name: string) =>
  pages[name].replace(/\{\{sunday(?:\+(\d+))?\}\}/g, (_mark, days: string | undefined) => addDays("2026-11-01", Number(days ?? 0)));

const page = (data: string) => `<html><body><script>window.__INITIAL_DATA__ = ${data};</script></body></html>`;
const offer = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({
    details: { brand: "Havets", name: "Laxfilé", mechanicInfo: "129 kr/kg" },
    category: { articleGroupName: "Färskvaror" },
    validTo: "2026-11-01T00:00:00",
    restriction: "",
    traits: ["Butiksunikt"],
    ...fields,
  });

describe("parseIcaOfferPage on the saved page", () => {
  it("reads the 7 offers on food and counts the 2 that are not", () => {
    const result = parseIcaOfferPage(fixture("ica-erbjudanden.html"));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.skipped).toBe(2);
    expect(result.data.offers.map((item) => `${item.brand} ${item.name}`)).toEqual([
      "Gårdens Herrgård®, Präst®",
      "Havets Laxfilé",
      "Bondens Krossade tomater",
      "Mejerigården Mellanmjölk",
      "Odlarna Gul lök",
      "Bageriet Rågbröd",
      "Frostens Frysta ärter",
    ]);
  });

  it("keeps the fields Matkoll uses, as the store wrote them", () => {
    const result = parseIcaOfferPage(fixture("ica-erbjudanden.html"));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.offers[0]).toEqual({
      brand: "Gårdens",
      name: "Herrgård®, Präst®",
      mechanicInfo: "89 kr/kg",
      restriction: "Max 1 köp/hushåll",
      category: "Färskvaror",
      validTo: "2026-11-22",
      memberOnly: true,
      regularPrice: 111.9,
      savingPercent: 20,
    });
    expect(result.data.offers[2]).toMatchObject({ mechanicInfo: "Köp 3 betala för 2", memberOnly: false, regularPrice: null, savingPercent: 33 });
    expect(result.data.offers[1]).toMatchObject({ mechanicInfo: "129 kr/kg", regularPrice: null, savingPercent: null });
    expect(result.data.offers[6]).toMatchObject({ validTo: "2026-11-08", restriction: "Max 2 köp/hushåll" });
  });

  it("never hands on the page's token, cookie or session id", () => {
    const html = fixture("ica-erbjudanden.html");
    expect(html).toContain("inte-en-riktig-nyckel");
    const text = JSON.stringify(parseIcaOfferPage(html));
    for (const secret of ["inte-en-riktig-nyckel", "inte-en-riktig-kaka", "inte-ett-riktigt-sessions-id", "publicAccessToken"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("gives offers_page_changed for a page without data, an empty list for an empty week", () => {
    expect(parseIcaOfferPage(fixture("ica-erbjudanden-utan-data.html"))).toEqual(fail("offers_page_changed"));
    expect(parseIcaOfferPage(fixture("ica-erbjudanden-tom.html"))).toEqual({ ok: true, data: { offers: [], skipped: 0 } });
  });
});

describe("parseIcaOfferPage's reader", () => {
  it("turns undefined and new Map([...]) outside strings into JSON", () => {
    const result = parseIcaOfferPage(
      page(`{"a":undefined,"m":new Map([["k",1]]),"e":new Map([]),"offers":{"x":undefined,"weeklyOffers":[${offer()}]}}`),
    );
    expect(result.ok && result.data.offers).toHaveLength(1);
  });

  it("leaves a }, undefined and new Map( inside strings alone", () => {
    // In the page's text the slash is written as ICA writes it, as an escape (/).
    const tricky = offer({ details: { brand: "Havets", name: 'Lax } "fin" undefined new Map(', mechanicInfo: "129 kr/kg" } }).replace(
      "129 kr/kg",
      "129 kr\\u002Fkg",
    );
    expect(tricky).toContain("kr\\u002Fkg");
    const result = parseIcaOfferPage(page(`{"note":"} ] ) new Set(","offers":{"weeklyOffers":[${tricky}]}}`));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.offers[0]).toMatchObject({ name: 'Lax } "fin" undefined new Map(', mechanicInfo: "129 kr/kg" });
  });

  it("reads numbers, true, false and null", () => {
    const result = parseIcaOfferPage(page(`{"n":-1.5e3,"t":true,"f":false,"z":null,"offers":{"weeklyOffers":[${offer()}]}}`));
    expect(result.ok).toBe(true);
  });

  it.each([
    ["another constructor", `{"s":new Set([1]),"offers":{"weeklyOffers":[${offer()}]}}`],
    ["a function", `{"f":function(){return 1},"offers":{"weeklyOffers":[${offer()}]}}`],
    ["an unquoted key", `{offers:{"weeklyOffers":[${offer()}]}}`],
    ["a single-quoted string", `{"offers":{"weeklyOffers":['x']}}`],
    ["a template", "{\"t\":`x`,\"offers\":{\"weeklyOffers\":[]}}"],
    ["a comment", `{"offers":/* x */{"weeklyOffers":[]}}`],
    ["Infinity", `{"n":Infinity,"offers":{"weeklyOffers":[]}}`],
    ["an unclosed object", `{"offers":{"weeklyOffers":[]}`],
    ["mismatched brackets", `{"offers":{"weeklyOffers":[}]}`],
  ])("gives offers_page_changed for %s", (_name, data) => {
    expect(parseIcaOfferPage(page(data))).toEqual(fail("offers_page_changed"));
  });

  it("gives offers_page_changed without weeklyOffers, or when no entry can be read", () => {
    expect(parseIcaOfferPage(page(`{"offers":{}}`))).toEqual(fail("offers_page_changed"));
    expect(parseIcaOfferPage(page(`{"offers":{"weeklyOffers":{}}}`))).toEqual(fail("offers_page_changed"));
    expect(parseIcaOfferPage(page(`{"offers":{"weeklyOffers":[{"x":1}]}}`))).toEqual(fail("offers_page_changed"));
    expect(parseIcaOfferPage("<html></html>")).toEqual(fail("offers_page_changed"));
  });

  it("leaves out an entry with the wrong shape and keeps the others", () => {
    const wrong = JSON.stringify({ details: { name: 7 }, category: {}, validTo: "nästa vecka" });
    const result = parseIcaOfferPage(page(`{"offers":{"weeklyOffers":[${wrong},${offer()}]}}`));
    expect(result.ok && result.data).toEqual({
      offers: [expect.objectContaining({ name: "Laxfilé" })],
      skipped: 0,
    });
  });

  it("leaves out an entry whose last day does not exist, and keeps the others", () => {
    const result = parseIcaOfferPage(
      page(`{"offers":{"weeklyOffers":[${offer({ validTo: "2026-02-30T00:00:00" })},${offer({ details: { brand: "", name: "Gul lök", mechanicInfo: "" } })}]}}`),
    );
    expect(result.ok && result.data.offers.map((entry) => entry.name)).toEqual(["Gul lök"]);
    // All of them impossible: the page is not read.
    expect(parseIcaOfferPage(page(`{"offers":{"weeklyOffers":[${offer({ validTo: "2026-13-01T00:00:00" })}]}}`))).toEqual(
      fail("offers_page_changed"),
    );
  });

  it("drops every field it does not use", () => {
    const result = parseIcaOfferPage(
      page(`{"offers":{"weeklyOffers":[${offer({ eans: [{ id: "123", image: "https://example.com/x.jpg" }], secret: "nyckel" })}]}}`),
    );
    expect(JSON.stringify(result)).not.toMatch(/eans|example\.com|nyckel/);
  });
});

describe("FOOD_CATEGORIES", () => {
  it("maps ICA's food categories to store sections and leaves the rest out", () => {
    expect(foodSection("Färskvaror")).toBe("Kött och fisk");
    expect(foodSection("Bröd, kex & bageri")).toBe("Bröd");
    expect(foodSection("frukt & grönt")).toBe("Frukt och grönt");
    expect(foodSection("Djupfryst")).toBe("Frys");
    expect(foodSection("Hem & fritid")).toBeNull();
    expect(foodSection("Hälsa & skönhet")).toBeNull();
    expect(foodSection(undefined)).toBeNull();
    expect(Object.keys(FOOD_CATEGORIES)).toContain("Dryck");
  });
});

describe("the reader's source", () => {
  it("never runs code: no eval, Function or vm", () => {
    const source = readerSource;
    expect(source.length).toBeGreaterThan(1000);
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\bFunction\s*\(/);
    expect(source).not.toMatch(/\bnew\s+Function\b/);
    expect(source).not.toMatch(/["']node:vm["']|["']vm["']|\bvm\./);
  });
});

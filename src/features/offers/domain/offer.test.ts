import { describe, expect, it } from "vitest";
import type { IcaOffer } from "./ica-offer-page";
import {
  fetchedAtText,
  fetchingOffersText,
  groupOffers,
  noOffersText,
  offerMetaText,
  offersFetchedText,
  offersSheetSubtitle,
  offersSkippedText,
  offersSummaryText,
  openOffersPageText,
  toOfferDraft,
} from "./offer";

const herrgard: IcaOffer = {
  brand: "Gårdens",
  name: "Herrgård®, Präst®",
  mechanicInfo: "89 kr/kg",
  restriction: "Max 1 köp/hushåll",
  category: "Färskvaror",
  validTo: "2026-11-22",
  memberOnly: true,
  regularPrice: 111.9,
  savingPercent: 20,
};

describe("toOfferDraft", () => {
  it("keeps the price and conditions as the store wrote them", () => {
    expect(
      toOfferDraft(herrgard, { label: "Gårdens Herrgård, Präst", name: "herrgård", ingredientId: null, section: null, icaSection: "Kött och fisk" }),
    ).toEqual({
      label: "Gårdens Herrgård, Präst",
      name: "herrgård",
      ingredientId: null,
      section: "Kött och fisk",
      price: "89 kr/kg",
      note: "Max 1 köp/hushåll",
      memberOnly: true,
      validTo: "2026-11-22",
      source: "link",
      regularPrice: 111.9,
      savingPercent: 20,
    });
  });

  it("takes the catalog ingredient's section first, and empty texts as null", () => {
    const draft = toOfferDraft(
      { ...herrgard, restriction: " ", mechanicInfo: "" },
      { label: "x", name: "laxfilé", ingredientId: "id", section: "Kött och fisk", icaSection: "Mejeri" },
    );
    expect(draft).toMatchObject({ section: "Kött och fisk", price: null, note: null });
    expect(toOfferDraft(herrgard, { label: "x", name: "x", ingredientId: null, section: null, icaSection: null }).section).toBe("Övrigt");
  });

  it("keeps the price to 40 and the note to 80 characters", () => {
    const draft = toOfferDraft(
      { ...herrgard, mechanicInfo: "x".repeat(60), restriction: "y".repeat(100) },
      { label: "x", name: "x", ingredientId: null, section: null, icaSection: null },
    );
    expect([...(draft.price ?? "")]).toHaveLength(40);
    expect([...(draft.note ?? "")]).toHaveLength(80);
  });
});

describe("texts", () => {
  it("writes the line under an offer, with the last day only when it is not the week's", () => {
    const offer = { price: "89 kr/kg", memberOnly: true, note: "Max 1 köp/hushåll", validTo: "2026-11-22", regularPrice: null, savingPercent: null };
    expect(offerMetaText(offer, "2026-10-26")).toBe("89 kr/kg · Stammis · Max 1 köp/hushåll · t.o.m. 22 nov");
    expect(offerMetaText({ ...offer, validTo: "2026-11-01" }, "2026-10-26")).toBe("89 kr/kg · Stammis · Max 1 köp/hushåll");
    expect(offerMetaText({ ...offer, price: "2 för 30 kr", memberOnly: false, note: null, validTo: null }, "2026-10-26")).toBe("2 för 30 kr");
    expect(offerMetaText({ ...offer, regularPrice: 111.9, savingPercent: 20 }, "2026-10-26")).toBe(
      "89 kr/kg · Ord. 111,90 kr · spara 20 % · Stammis · Max 1 köp/hushåll · t.o.m. 22 nov",
    );
    expect(offerMetaText({ ...offer, price: "25% rabatt", note: null, validTo: null, memberOnly: false, savingPercent: 25 }, "2026-10-26")).toBe(
      "25% rabatt · spara 25 %",
    );
  });

  it("confirms a fetch and says what was not food", () => {
    expect(offersFetchedText(7, "2026-10-26")).toBe("Hämtade 7 erbjudanden för vecka 44.");
    expect(offersFetchedText(1, "2026-10-26")).toBe("Hämtade 1 erbjudande för vecka 44.");
    expect(offersSkippedText(2)).toBe("2 varor som inte är mat togs inte med.");
    expect(offersSkippedText(1)).toBe("1 vara som inte är mat togs inte med.");
  });

  it("writes the sheet's texts", () => {
    expect(offersSheetSubtitle("Maxi ICA Stormarknad Östersund", "2026-10-26")).toBe(
      "Maxi ICA Stormarknad Östersund · vecka 44, 26 okt–1 nov",
    );
    expect(noOffersText("2026-11-02")).toBe("Inga erbjudanden hämtade för vecka 45.");
    expect(fetchingOffersText("ica.se")).toBe("Hämtar erbjudandena från ica.se …");
    expect(openOffersPageText("ica.se")).toBe("Öppna sidan på ica.se");
  });

  it("says when the offers were fetched, in Swedish time", () => {
    const now = new Date("2026-10-28T12:00:00+01:00");
    expect(fetchedAtText(new Date("2026-10-28T07:12:00+01:00"), now)).toBe("hämtade idag 07:12");
    expect(fetchedAtText(new Date("2026-10-27T18:30:00+01:00"), now)).toBe("hämtade igår 18:30");
    expect(fetchedAtText(new Date("2026-10-26T07:05:00+01:00"), now)).toBe("hämtade 26 okt 07:05");
    expect(offersSummaryText(7, new Date("2026-10-28T07:12:00+01:00"), now)).toBe("7 erbjudanden · hämtade idag 07:12");
    expect(offersSummaryText(1, null, now)).toBe("1 erbjudande");
  });
});

describe("groupOffers", () => {
  it("puts the offers under their display categories, in the store's order, keeping the page's order within each", () => {
    const groups = groupOffers([
      { section: "Mejeri" as const, name: "mellanmjölk", id: 1 },
      { section: "Kött och fisk" as const, name: "laxfilé", id: 2 },
      { section: "Frukt och grönt" as const, name: "gul lök", id: 3 },
      { section: "Kött och fisk" as const, name: "herrgård", id: 4 },
      { section: "Skafferi" as const, name: "senap", id: 5 },
    ]);
    expect(groups.map(({ category, offers }) => [category, offers.map((offer) => offer.id)])).toEqual([
      ["Frukt & grönt", [3]],
      ["Mejeri & ägg", [1]],
      ["Kött, fisk & chark", [2, 4]],
      ["Såser & smaksättare", [5]],
    ]);
  });
});

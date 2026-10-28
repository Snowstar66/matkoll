import { describe, expect, it } from "vitest";
import {
  OFFER_SITE_DOMAINS,
  OFFER_SITES,
  offerSiteFor,
  offersLinkCardText,
  offersSiteName,
  parseOffersLink,
} from "./offers-link";

const maxi = "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/";

describe("OFFER_SITES", () => {
  it("has one site in 1.2: ica.se's offer pages, for the chain ICA", () => {
    expect(OFFER_SITES.map(({ host, chain, name }) => ({ host, chain, name }))).toEqual([
      { host: "www.ica.se", chain: "ICA", name: "ica.se" },
    ]);
    expect(OFFER_SITE_DOMAINS).toEqual(["www.ica.se"]);
    expect(offerSiteFor("ICA")?.host).toBe("www.ica.se");
    expect(offerSiteFor("Willys")).toBeUndefined();
  });
});

describe("parseOffersLink", () => {
  it.each([
    [maxi, maxi],
    ["https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733", maxi],
    [`  ${maxi}  `, maxi],
    ["HTTPS://WWW.ICA.SE/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/", maxi],
    ["https://www.ica.se/erbjudanden/ica-nara-1-2-34/", "https://www.ica.se/erbjudanden/ica-nara-1-2-34/"],
  ])("accepts %s", (text, url) => {
    expect(parseOffersLink(text, "ICA")?.url).toBe(url);
  });

  it.each([
    ["another chain's site", "https://www.willys.se/erbjudanden/butik"],
    ["a recipe on ica.se", "https://www.ica.se/recept/kladdkaka-123/"],
    ["ica.se without www", "https://ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/"],
    ["the e-shop", "https://handlaprivatkund.ica.se/stores/1003733"],
    ["http", "http://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/"],
    ["a query", `${maxi}?utm_source=x`],
    ["an empty query", `${maxi}?`],
    ["a fragment", `${maxi}#erbjudanden`],
    ["a port", "https://www.ica.se:8443/erbjudanden/maxi-1003733/"],
    ["a user name", "https://pontus@www.ica.se/erbjudanden/maxi-1003733/"],
    ["no store id", "https://www.ica.se/erbjudanden/maxi-ica/"],
    ["a deeper path", "https://www.ica.se/erbjudanden/maxi-1003733/extra/"],
    ["the offers start page", "https://www.ica.se/erbjudanden/"],
    ["whitespace inside", "https://www.ica.se/erbjudanden/maxi ica-1003733/"],
    ["over 300 characters", `https://www.ica.se/erbjudanden/${"a".repeat(270)}-1003733/`],
    ["no address", "maxi-ica-stormarknad-ostersund-1003733"],
  ])("refuses %s", (_name, text) => {
    expect(parseOffersLink(text, "ICA")).toBeNull();
  });

  it("refuses every link for a chain without an offer site", () => {
    expect(parseOffersLink(maxi, "Willys")).toBeNull();
    expect(parseOffersLink(maxi, "Annan")).toBeNull();
  });
});

describe("the store card's line", () => {
  it("names the site of a stored link", () => {
    expect(offersSiteName(maxi)).toBe("ica.se");
    expect(offersSiteName("https://example.com/")).toBeNull();
    expect(offersSiteName("inte en adress")).toBeNull();
    expect(offersLinkCardText("ica.se")).toBe("Erbjudanden: ica.se");
  });
});

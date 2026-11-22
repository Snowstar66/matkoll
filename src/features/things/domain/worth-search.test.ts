import { describe, expect, it } from "vitest";
import { phraseForSearch, searchPhrase, soldLinks } from "./worth-search";

// The links that open a search for sold lookalikes (Värdetips, level 1): the phrase is cleaned, åäö and
// special characters are encoded, and nothing here is a price.

describe("the search phrase", () => {
  it("is one line without quotation marks or control characters", () => {
    expect(searchPhrase('  Orrefors  "kristallskål"\nslipad ')).toBe("Orrefors kristallskål slipad");
    // Written as code points: invisible characters are never written literally in the files.
    expect(searchPhrase(`a${String.fromCharCode(0)}b${String.fromCodePoint(0x200b)}c`)).toBe("a b c");
    expect(searchPhrase(null)).toBe("");
    expect(searchPhrase("   ")).toBe("");
  });

  it("is cut at a word to at most 80 characters", () => {
    const long = Array.from({ length: 30 }, () => "kristall").join(" ");
    const phrase = searchPhrase(long);
    expect(phrase.length).toBeLessThanOrEqual(80);
    expect(phrase.endsWith("kristall")).toBe(true);
  });

  it("is the explanation's own, else the föremål's name", () => {
    expect(phraseForSearch("Skultuna mässingsljusstake", "Ljusstake")).toBe("Skultuna mässingsljusstake");
    expect(phraseForSearch("", "Ljusstake i mässing")).toBe("Ljusstake i mässing");
    expect(phraseForSearch(undefined, " ")).toBe("");
  });
});

describe("the links", () => {
  it("are Tradera (ended), eBay (sold, completed) and Bukowskis (through Google), in that order", () => {
    const links = soldLinks("Orrefors kristallskål");
    expect(links.map((link) => link.key)).toEqual(["tradera", "ebay", "bukowskis"]);
    expect(links[0]?.href).toBe("https://www.tradera.com/search?q=Orrefors%20kristallsk%C3%A5l&itemStatus=Ended");
    expect(links[1]?.href).toBe("https://www.ebay.com/sch/i.html?_nkw=Orrefors%20kristallsk%C3%A5l&LH_Sold=1&LH_Complete=1");
    expect(links[2]?.href).toBe("https://www.google.com/search?q=Orrefors%20kristallsk%C3%A5l%20site%3Abukowskis.com");
    expect(links.map((link) => link.hint)).toEqual(["avslutade", "sålda", "via Google"]);
  });

  it("encode åäö and characters that would break an address", () => {
    const [tradera, ebay, bukowskis] = soldLinks("Räv & Hare #1 50% a=b?c/d");
    for (const link of [tradera, ebay, bukowskis]) {
      const query = new URL(link?.href ?? "").searchParams;
      const sent = query.get("q") ?? query.get("_nkw");
      expect(sent).toContain("Räv & Hare #1 50% a=b?c/d");
    }
    expect(new URL(ebay?.href ?? "").searchParams.get("LH_Sold")).toBe("1");
    expect(new URL(tradera?.href ?? "").searchParams.get("itemStatus")).toBe("Ended");
    expect(new URL(bukowskis?.href ?? "").searchParams.get("q")).toBe("Räv & Hare #1 50% a=b?c/d site:bukowskis.com");
  });

  it("are none for an empty phrase", () => {
    expect(soldLinks("  ")).toEqual([]);
  });
});

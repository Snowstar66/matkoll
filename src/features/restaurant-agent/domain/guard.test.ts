import { describe, expect, it } from "vitest";
import { guardSuggestions, normalizeUrl } from "./guard";

const searched = ["https://krogen.se/meny", "https://pizza.se/", "https://omdome.example/lund#krogen"];
const menuText = "Pasta al pomodoro 135 kr\nPizza margherita 125 kr";
const good = { name: " Krogen ", area: "Centrum", website: "https://krogen.se/", why: [{ text: " Har vegetarisk pasta ", sourceUrl: "https://krogen.se/meny" }], menu: { text: menuText, sourceUrl: "https://krogen.se/meny" }, address: { text: "Storgatan 1", sourceUrl: "https://krogen.se/meny" }, hours: { text: "Mån-fre 11-21", sourceUrl: "https://invented.example/" }, rating: null, warnings: ["diet_unverified"] };

describe("guardSuggestions", () => {
  it("accepts a place whose reason cites a page the search returned, and trims it", () => {
    const { valid, rejected } = guardSuggestions([good], searched);
    expect(rejected).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({ name: "Krogen", area: "Centrum", website: "https://krogen.se/", why: [{ text: "Har vegetarisk pasta", sourceUrl: "https://krogen.se/meny" }], menuStatus: "found", warnings: ["diet_unverified"] });
    expect(valid[0]?.id).toMatch(/^[0-9a-f]{16}$/);
  });
  it("drops a place whose every source was invented", () => {
    const result = guardSuggestions([{ ...good, why: [{ text: "x", sourceUrl: "https://invented.example/" }] }], searched);
    expect(result.valid).toEqual([]);
    expect(result.rejected).toEqual([{ name: "Krogen", reason: "no_source" }]);
  });
  it("cuts a reason with an unknown source but keeps the place when another reason is sourced", () => {
    const { valid, rejected } = guardSuggestions([{ ...good, why: [{ text: "ok", sourceUrl: "https://krogen.se/meny" }, { text: "made up", sourceUrl: "https://invented.example/" }] }], searched);
    expect(rejected).toEqual([]);
    expect(valid[0]?.why).toEqual([{ text: "ok", sourceUrl: "https://krogen.se/meny" }]);
  });
  it("compares addresses without fragment and trailing slash, and never accepts a non-http source", () => {
    expect(normalizeUrl("HTTPS://Pizza.se")).toBe("https://pizza.se");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(guardSuggestions([{ ...good, why: [{ text: "x", sourceUrl: "https://pizza.se" }] }], searched).valid).toHaveLength(1);
    expect(guardSuggestions([{ ...good, why: [{ text: "x", sourceUrl: "javascript:alert(1)" }] }], ["javascript:alert(1)"]).valid).toEqual([]);
  });
  it("keeps a website only when the search returned a page on that site", () => {
    expect(guardSuggestions([{ ...good, website: "https://other.example/" }], searched).valid[0]?.website).toBeNull();
  });
  it("counts a menu only when quoted from a returned page and long enough; flags a missing menu whatever the model said", () => {
    const noMenu = guardSuggestions([{ ...good, menu: { text: menuText, sourceUrl: "https://invented.example/" }, warnings: [] }], searched).valid[0];
    expect(noMenu).toMatchObject({ menuStatus: "missing", menu: null, warnings: ["menu_missing"] });
    expect(guardSuggestions([{ ...good, menu: { text: "Pasta", sourceUrl: "https://krogen.se/meny" } }], searched).valid[0]?.menuStatus).toBe("missing");
    expect(guardSuggestions([{ ...good, menu: null }], searched).valid[0]?.menuStatus).toBe("missing");
    expect(guardSuggestions([{ ...good, warnings: ["menu_missing"] }], searched).valid[0]?.warnings).not.toContain("menu_missing");
  });
  it("drops unknown flags, and a duplicate of the same place", () => {
    const { valid, rejected } = guardSuggestions([{ ...good, warnings: ["bogus", "diet_unverified", "diet_unverified"] }, good], searched);
    expect(valid[0]?.warnings).toEqual(["diet_unverified"]);
    expect(rejected).toEqual([{ name: "Krogen", reason: "duplicate" }]);
  });
  it("copes with garbage", () => {
    expect(guardSuggestions("nope", searched)).toEqual({ valid: [], rejected: [] });
    expect(guardSuggestions([null, 3, {}, { name: "x" }, { name: "x", why: "y" }], searched).valid).toEqual([]);
  });

  it("shows an address and hours only when quoted from a returned page", () => {
    const place = guardSuggestions([good], searched).valid[0];
    expect(place?.address).toEqual({ text: "Storgatan 1", sourceUrl: "https://krogen.se/meny" });
    expect(place?.hours).toBeNull();
  });
});

describe("guardSuggestions: rating", () => {
  const rating = { value: 4.3, scale: 5, count: 120, sourceName: "omdome.example", sourceUrl: "https://omdome.example/lund#krogen", quote: "4,3 av 5, 120 omdömen" };
  const ratingOf = (r: unknown) => guardSuggestions([{ ...good, rating: r }], searched).valid[0]?.rating;
  it("accepts a rating from a returned page whose quote holds the number and the count", () => {
    expect(ratingOf(rating)).toEqual({ value: 4.3, scale: 5, count: 120, sourceName: "omdome.example", sourceUrl: "https://omdome.example/lund#krogen" });
    expect(ratingOf({ ...rating, quote: "Betyg 4.3 (120 omdömen)" })?.value).toBe(4.3);
    expect(ratingOf({ ...rating, count: null, quote: "4,3 av 5" })?.count).toBeNull();
  });
  it("drops the rating, never the place, when the source was not returned", () => {
    const { valid, rejected } = guardSuggestions([{ ...good, rating: { ...rating, sourceUrl: "https://invented.example/" } }], searched);
    expect(rejected).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]?.rating).toBeNull();
  });
  it("drops a number that is not in the quoted text, an own average, and nonsense", () => {
    expect(ratingOf({ ...rating, quote: "Gästerna älskar det" })).toBeNull();
    expect(ratingOf({ ...rating, value: 4.5 })).toBeNull();
    expect(ratingOf({ ...rating, value: 4, quote: "4,3 av 5, 120 omdömen" })).toBeNull();
    expect(ratingOf({ ...rating, count: 99 })).toBeNull();
    expect(ratingOf({ ...rating, value: 6 })).toBeNull();
    expect(ratingOf({ ...rating, scale: 7 })).toBeNull();
    expect(ratingOf({ ...rating, count: 1.5 })).toBeNull();
    expect(ratingOf({ ...rating, quote: "x".repeat(101) })).toBeNull();
    expect(ratingOf("4,3")).toBeNull();
    expect(ratingOf(null)).toBeNull();
  });
});

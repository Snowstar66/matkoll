import { describe, expect, it } from "vitest";
import { allowedSourcesOf, guardSuggestions } from "./guard";
import type { MenuSource } from "./types";

const sources: MenuSource[] = [
  { placeId: "p1", url: "https://krogen.se/meny", text: "Pasta", via: "fetch" },
  { placeId: "p2", url: "https://pizza.se/", text: "Pizza", via: "web_search" },
  { placeId: "p3", url: "javascript:alert(1)", text: "x", via: "fetch" },
];
const ids = new Set(["p1", "p2", "p3", "p4"]);
const good = { placeId: "p1", menuStatus: "found", why: [{ text: " Har vegetarisk pasta ", sourceUrl: "https://krogen.se/meny" }], warnings: ["allergy_unverified"] };

describe("guardSuggestions", () => {
  it("accepts a known place with a sourced reason and trims it", () => {
    const { valid, rejected } = guardSuggestions([good], ids, sources);
    expect(rejected).toEqual([]);
    expect(valid).toEqual([{ placeId: "p1", menuStatus: "found", why: [{ text: "Har vegetarisk pasta", sourceUrl: "https://krogen.se/meny" }], warnings: ["allergy_unverified"] }]);
  });
  it("rejects a place the finder did not return", () => {
    expect(guardSuggestions([{ ...good, placeId: "ghost" }], ids, sources).rejected).toEqual([{ placeId: "ghost", reason: "unknown_place" }]);
  });
  it("rejects a reason without a source, with a foreign source or from another place", () => {
    const bad = (sourceUrl: unknown) => guardSuggestions([{ ...good, why: [{ text: "x", sourceUrl }] }], ids, sources).rejected[0]?.reason;
    expect(bad(undefined)).toBe("no_reason_source");
    expect(bad("https://invented.se")).toBe("no_reason_source");
    expect(bad("https://pizza.se/")).toBe("no_reason_source");
    expect(guardSuggestions([{ ...good, why: [{ text: "  ", sourceUrl: "https://krogen.se/meny" }] }], ids, sources).rejected[0]?.reason).toBe("no_reason_source");
  });
  it("never accepts a non-http source", () => {
    expect(allowedSourcesOf(sources).has("p3")).toBe(false);
    expect(guardSuggestions([{ placeId: "p3", menuStatus: "found", why: [{ text: "x", sourceUrl: "javascript:alert(1)" }], warnings: [] }], ids, sources).valid).toEqual([]);
  });
  it("needs a reason when the menu was found, and flags a missing menu whatever the model said", () => {
    expect(guardSuggestions([{ ...good, why: [] }], ids, sources).rejected[0]?.reason).toBe("found_without_reason");
    const missing = guardSuggestions([{ placeId: "p4", menuStatus: "missing", why: [], warnings: [] }], ids, sources);
    expect(missing.valid).toEqual([{ placeId: "p4", menuStatus: "missing", why: [], warnings: ["menu_missing"] }]);
  });
  it("drops unknown warning flags and duplicates a place", () => {
    const { valid, rejected } = guardSuggestions([{ ...good, warnings: ["bogus", "menu_missing", "menu_missing"] }, good], ids, sources);
    expect(valid[0]?.warnings).toEqual(["menu_missing"]);
    expect(rejected).toEqual([{ placeId: "p1", reason: "duplicate" }]);
  });
  it("copes with garbage", () => {
    expect(guardSuggestions("nope", ids, sources)).toEqual({ valid: [], rejected: [] });
    expect(guardSuggestions([null, 3, {}, { placeId: "p1" }, { placeId: "p1", menuStatus: "found" }], ids, sources).valid).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/errors";
import type { PlacesOutcome, RawPlace } from "../data/places";
import type { FindInput } from "./contract";
import { runFind, type RunDeps } from "./run";

vi.mock("server-only", () => ({}));

const secretName = "Trattoria Hemligt Namn";
const secretAddress = "Gatan 12, 111 22 Stockholm";
const place = (id: string, extra: Partial<RawPlace> = {}): RawPlace => ({ id, name: `${secretName} ${id}`, address: secretAddress, lat: 59.33, lng: 18.07, primaryType: "pizza_restaurant", mapsUrl: `https://maps.google.com/?cid=${id}`, openNow: true, websiteUri: `https://${id}.example.se/`, ...extra });
const settings = { radiusM: 1000 as const, party: 2, cuisines: [], priorities: [] };
const coords: FindInput = { location: { kind: "coords", lat: 59.3301, lng: 18.0701 }, settings, cuisines: [] };
const html = (text: string) => `<html><body><h1>${text}</h1><p>Margherita 125 kr, Capricciosa 139 kr, vegetarisk pasta</p><a href="/meny">Meny</a></body></html>`;

function deps(overrides: Partial<RunDeps> = {}, places: RawPlace[] = [place("p1"), place("p2", { websiteUri: null })]) {
  const pick = vi.fn(async (input: { restaurants: { placeId: string; pages: { url: string }[] }[] }) =>
    ok({ quality: "standard", suggestions: input.restaurants.filter((r) => r.pages.length > 0).map((r) => ({ placeId: r.placeId, menuStatus: "found", why: [{ text: "Har pizza", sourceUrl: r.pages[0]?.url }], warnings: [] })) }));
  const search = vi.fn(async (): Promise<PlacesOutcome> => ({ ok: true, places }));
  const record = vi.fn(async () => {});
  const base: RunDeps = {
    signedIn: async () => true,
    apiKey: "key",
    dayRemainingSek: async () => 10,
    recordPlacesRequest: record,
    searchPlaces: search,
    fetchPage: async (url) => ({ url, html: html("Välkommen") }),
    household: async () => ({ people: [{ tastes: {}, allergies: ["gluten"], likes: ["pizza"], avoids: ["svamp"] }] }),
    ai: async () => ({ pickRestaurants: pick as never }),
    prices: { standard: { usdPerMTokIn: 0.1, usdPerMTokOut: 0.5 }, careful: { usdPerMTokIn: 2, usdPerMTokOut: 10 } },
    ...overrides,
  };
  return { base, pick, search, record };
}

describe("runFind", () => {
  it("finds, reads the own sites, asks the model and returns views with Google facts for the browser", async () => {
    const { base, pick, record } = deps();
    const result = await runFind(base, coords);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model).toBe("haiku-5.5");
    expect(result.suggestions.map((s) => s.placeId)).toEqual(["p1", "p2"]);
    expect(result.suggestions[0]).toMatchObject({ name: `${secretName} p1`, address: secretAddress, openNow: true, menuStatus: "found", why: [{ text: "Har pizza" }] });
    expect(result.suggestions[0]?.menuText).toContain("Margherita");
    expect(result.suggestions[0]?.distanceM).toBeGreaterThanOrEqual(0);
    expect(result.suggestions[1]).toMatchObject({ menuStatus: "missing", menuText: null, flags: expect.arrayContaining(["menu_missing"]) });
    // The household has an allergy: a found menu always says it cannot be verified.
    expect(result.suggestions[0]?.flags).toContain("allergy_unverified");
    expect(record).toHaveBeenCalledTimes(1);
    expect(result.costSek).toBeGreaterThan(0.34);
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it("never gives the model a Google field or a coordinate", async () => {
    const { base, pick } = deps();
    await runFind(base, coords);
    const sent = JSON.stringify(pick.mock.calls);
    for (const secret of [secretName, secretAddress, "maps.google.com", "59.33", "18.07", "Stockholm"]) expect(sent).not.toContain(secret);
    expect(sent).toContain("p1");
  });

  it("sends the rounded coordinates to Google only", async () => {
    const { base, search } = deps();
    await runFind(base, coords);
    expect(search).toHaveBeenCalledWith("key", { kind: "nearby", at: { lat: 59.33, lng: 18.07 }, radiusM: 1000 });
  });

  it("answers needs_location for bad coordinates and text, without calling Google", async () => {
    const { base, search } = deps();
    expect(await runFind(base, { ...coords, location: { kind: "coords", lat: 200, lng: 0 } })).toEqual({ status: "needs_location" });
    expect(await runFind(base, { ...coords, location: { kind: "text", text: "http://x.se" } })).toEqual({ status: "needs_location" });
    expect(await runFind(base, { ...coords, location: { kind: "text", text: "  " } })).toEqual({ status: "needs_location" });
    expect(search).not.toHaveBeenCalled();
  });

  it("uses a text search for a typed place, with no distance, and the user's niches in the query", async () => {
    const { base, search } = deps();
    const result = await runFind(base, { location: { kind: "text", text: "Uppsala" }, settings, cuisines: ["sushi", "nonsense"] });
    expect(search).toHaveBeenCalledWith("key", { kind: "text", text: "Sushi restaurang Uppsala" });
    expect(result.status === "ok" && result.suggestions[0]?.distanceM).toBeNull();
  });

  it("says the search is not turned on without a key, and requires sign-in", async () => {
    expect(await runFind(deps({ apiKey: undefined }).base, coords)).toEqual({ status: "error", message: "Restaurangsökning är inte påslagen än.", code: "not_configured" });
    expect(await runFind(deps({ signedIn: async () => false }).base, coords)).toMatchObject({ status: "error" });
  });

  it("stops with cap_reached before any Google request when the day is used up", async () => {
    const { base, search, record } = deps({ dayRemainingSek: async () => 0.1 });
    expect(await runFind(base, coords)).toEqual({ status: "cap_reached" });
    expect(search).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("reports a failed Google request as an error and counts nothing", async () => {
    const { base, record } = deps({ searchPlaces: async () => ({ ok: false, reason: "http" }) });
    expect(await runFind(base, coords)).toMatchObject({ status: "error", code: "places_failed" });
    expect(record).not.toHaveBeenCalled();
  });

  it("answers no_results for an empty finder answer and for places outside the radius", async () => {
    expect(await runFind(deps({}, []).base, coords)).toEqual({ status: "no_results" });
    expect(await runFind(deps({}, [place("far", { lat: 60.5, lng: 18.07 })]).base, coords)).toEqual({ status: "no_results" });
  });

  it("falls back to the rule-based order, with the menu text but no reasons, when the model fails", async () => {
    const { base } = deps({ ai: async () => ({ pickRestaurants: (async () => ({ ok: false, error: { code: "ai_unavailable" } })) as never }) });
    const result = await runFind(base, coords);
    expect(result).toMatchObject({ status: "ok", model: "rules" });
    expect(result.status === "ok" && result.suggestions[0]).toMatchObject({ placeId: "p1", why: [], menuStatus: "found" });
  });

  it("skips the model when no restaurant has a readable own site", async () => {
    const ai = vi.fn();
    const result = await runFind(deps({ fetchPage: async () => null, ai: async () => (ai(), { pickRestaurants: vi.fn() as never }) }).base, coords);
    expect(ai).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "ok", model: "rules" });
    expect(result.status === "ok" && result.suggestions.every((s) => s.menuStatus === "missing")).toBe(true);
  });

  it("does not use a model answer that cites a page it was not given", async () => {
    const lying = async () => ok({ quality: "standard", suggestions: [{ placeId: "p1", menuStatus: "found", why: [{ text: "x", sourceUrl: "https://evil.example/" }], warnings: [] }] });
    const { base } = deps({ ai: async () => ({ pickRestaurants: lying as never }) });
    const result = await runFind(base, coords);
    expect(result.status === "ok" && result.suggestions.flatMap((s) => s.why)).toEqual([]);
  });
});

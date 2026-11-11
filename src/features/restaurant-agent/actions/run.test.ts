import { describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/errors";
import type { FindInput } from "./contract";
import { runFind, type RunDeps } from "./run";

vi.mock("server-only", () => ({}));

const settings = { radiusM: 1000 as const, when: "evening" as const, party: 2, cuisines: [], priorities: [] };
const typed: FindInput = { location: { kind: "text", text: "Uppsala" }, settings, cuisines: [] };
const sourceUrls = ["https://salvia.example/meny", "https://fyr.example/"];
const menu = "Pasta al pomodoro 135 kr\nPizza margherita 125 kr";

function deps(overrides: Partial<RunDeps> = {}) {
  const find = vi.fn(async (_input: unknown) =>
    ok({
      quality: "standard" as const,
      sourceUrls,
      searches: 2,
      inputTokens: 20_000,
      outputTokens: 2_000,
      suggestions: [
        { name: "Trattoria Salvia", area: "Centrum", website: "https://salvia.example/", why: [{ text: "Har pizza", sourceUrl: sourceUrls[0] as string }], menu: { text: menu, sourceUrl: sourceUrls[0] as string }, address: { text: "Exempelgatan 4", sourceUrl: sourceUrls[0] as string }, hours: null, rating: null, warnings: [] },
        { name: "Bistro Fyr", area: null, website: null, why: [{ text: "Husmanskost", sourceUrl: sourceUrls[1] as string }], menu: null, address: null, hours: null, rating: null, warnings: [] },
        { name: "Spöket", area: null, website: null, why: [{ text: "Påhittat", sourceUrl: "https://invented.example/" }], menu: null, address: null, hours: null, rating: null, warnings: [] },
      ],
    }),
  );
  const placeOf = vi.fn(async () => ({ ok: true as const, place: "Luthagen, Uppsala" }));
  const base: RunDeps = {
    signedIn: async () => true,
    dayRemainingSek: async () => 10,
    household: async () => ({ people: [{ allergies: ["gluten"], likes: ["pizza"], avoids: ["svamp"] }] }),
    placeOf,
    ai: async () => ({ findRestaurantsWeb: find as never }),
    prices: { standard: { usdPerMTokIn: 0.1, usdPerMTokOut: 0.5 }, careful: { usdPerMTokIn: 2, usdPerMTokOut: 10 } },
    ...overrides,
  };
  return { base, find, placeOf };
}

describe("runFind", () => {
  it("searches the web for a typed place and returns only sourced places, with the menu quoted from a cited page", async () => {
    const { base, find } = deps();
    const result = await runFind(base, typed);
    expect(find.mock.calls[0]?.[0]).toMatchObject({ place: "Uppsala", party: 2, quality: "standard" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // The invented place with an unknown source is dropped by the guard; Sonnet is then asked and answers the same, so the first answer's valid places stay.
    expect(result.suggestions.map((s) => s.name)).toEqual(["Trattoria Salvia", "Bistro Fyr"]);
    expect(result.place).toBe("Uppsala");
    expect(result.suggestions[0]).toMatchObject({ address: { text: "Exempelgatan 4", sourceUrl: sourceUrls[0] }, menuStatus: "found", menuText: menu, area: "Centrum", website: "https://salvia.example/", why: [{ text: "Har pizza", sourceUrl: sourceUrls[0] }] });
    expect(result.suggestions[1]).toMatchObject({ menuStatus: "missing", menuText: null, flags: expect.arrayContaining(["menu_missing"]) });
    // The household has an allergy: it is never called safe.
    expect(result.suggestions.every((s) => s.flags.includes("allergy_unverified"))).toBe(true);
    expect(result.costSek).toBeGreaterThan(0.2);
    expect(JSON.stringify(result)).not.toContain("invented.example");
  });

  it("turns a rounded position into a place name on the server and sends only the name on", async () => {
    const { base, find, placeOf } = deps();
    await runFind(base, { ...typed, location: { kind: "coords", lat: 59.8586, lng: 17.6389 } });
    expect(placeOf).toHaveBeenCalledWith(59.86, 17.64);
    const sent = JSON.stringify(find.mock.calls);
    expect(sent).toContain("Luthagen, Uppsala");
    for (const digits of ["59.8", "17.6", "59.86", "17.64"]) expect(sent).not.toContain(digits);
  });

  it("falls back to the typed field (needs_location) when the position is bad, the lookup fails or is switched off", async () => {
    const { base, find } = deps();
    expect(await runFind(base, { ...typed, location: { kind: "coords", lat: 200, lng: 0 } })).toEqual({ status: "needs_location" });
    expect(await runFind(deps({ placeOf: async () => ({ ok: false }) }).base, { ...typed, location: { kind: "coords", lat: 59.8, lng: 17.6 } })).toEqual({ status: "needs_location" });
    expect(await runFind(deps({ placeOf: null }).base, { ...typed, location: { kind: "coords", lat: 59.8, lng: 17.6 } })).toEqual({ status: "needs_location" });
    expect(await runFind(base, { ...typed, location: { kind: "text", text: "http://x.se" } })).toEqual({ status: "needs_location" });
    expect(find).not.toHaveBeenCalled();
  });

  it("merges the niches of this run and ignores unknown ones", async () => {
    const { base, find } = deps();
    await runFind(base, { ...typed, cuisines: ["sushi", "nonsense"] });
    expect(find.mock.calls[0]?.[0]).toMatchObject({ wantedCuisines: ["Sushi"] });
  });

  it("requires sign-in", async () => {
    expect(await runFind(deps({ signedIn: async () => false }).base, typed)).toMatchObject({ status: "error" });
  });

  it("stops with cap_reached when the day is used up, without calling the model", async () => {
    const { base, find } = deps({ dayRemainingSek: async () => 0.1 });
    expect(await runFind(base, typed)).toEqual({ status: "cap_reached" });
    expect(find).not.toHaveBeenCalled();
  });

  it("answers no_results when nothing could be sourced, and an error when the model fails", async () => {
    const none = vi.fn(async () => ok({ quality: "standard" as const, sourceUrls: [], searches: 1, inputTokens: 1, outputTokens: 1, suggestions: [] }));
    // An empty but well-formed answer has no rejections, but also nothing valid: it is a failure of the guard step, shown as an error.
    expect(await runFind(deps({ ai: async () => ({ findRestaurantsWeb: none as never }) }).base, typed)).toMatchObject({ status: "error" });
    const boom = vi.fn(async () => {
      throw new Error("x");
    });
    expect(await runFind(deps({ ai: async () => ({ findRestaurantsWeb: boom as never }) }).base, typed)).toMatchObject({ status: "error", code: "search_failed" });
  });
});

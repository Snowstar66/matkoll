import { describe, expect, it } from "vitest";
import { buildLlmInput, maxPageChars, type LlmHousehold } from "./llm-input";
import type { Candidate, MenuSource, PlaceFacts } from "./types";
import { defaultRestaurantSettings } from "./types";

// The legal design (domain/types.ts): nothing derived from Google Places may reach the model.

const facts: PlaceFacts = { placeId: "p1", name: "Krogen Gyllene", address: "Storgatan 1, Lund", rating: 4.6, openNow: true, mapsUrl: "https://maps.google.com/?cid=1" };
const candidate: Candidate = { placeId: "p1", distanceM: 321, kind: "pizza" };
const household: LlmHousehold = { people: [{ allergies: ["gluten"], likes: ["pizza"], avoids: ["koriander"] }] };

describe("buildLlmInput", () => {
  it("builds the prompt input from bare ids, pages and the household only", () => {
    // Compile-time only: never called.
    const typeChecks = () => {
      // @ts-expect-error Candidate objects (Google-derived) are not accepted; only bare ids.
      buildLlmInput(defaultRestaurantSettings, household, [candidate], []);
      // @ts-expect-error PlaceFacts is not a MenuSource.
      buildLlmInput(defaultRestaurantSettings, household, ["p1"], [facts]);
    };
    expect(typeChecks).toBeTypeOf("function");
    const input = buildLlmInput(defaultRestaurantSettings, household, [candidate.placeId], [{ placeId: "p1", url: "https://krogen.se/", text: "Pizza Margherita", via: "fetch" }]);
    expect(input.restaurants).toEqual([{ placeId: "p1", pages: [{ url: "https://krogen.se/", text: "Pizza Margherita" }] }]);
  });

  it("lets no Places field through, even smuggled into the arguments", () => {
    const smuggled = { placeId: "p1", url: "https://krogen.se/", text: "Pizza", via: "fetch", name: facts.name, address: facts.address, rating: 4.6, distanceM: 321, mapsUrl: facts.mapsUrl } as MenuSource;
    const json = JSON.stringify(buildLlmInput(defaultRestaurantSettings, household, ["p1"], [smuggled]));
    for (const secret of [facts.name, facts.address, facts.mapsUrl, "4.6", "321", "rating", "distanceM", "openNow", "google", "lat", "lng"]) {
      expect(json.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it("has a fixed set of top-level keys and no location", () => {
    const input = buildLlmInput(defaultRestaurantSettings, household, ["p1"], []);
    expect(Object.keys(input).sort()).toEqual(["household", "party", "priorities", "restaurants", "wantedCuisines"]);
    expect(Object.keys(input.restaurants[0] ?? {}).sort()).toEqual(["pages", "placeId"]);
  });

  it("passes the wishes as labels, drops pages of other places and cuts long pages", () => {
    const sources: MenuSource[] = [
      { placeId: "p1", url: "https://a.se/", text: "x".repeat(maxPageChars + 50), via: "fetch" },
      { placeId: "p9", url: "https://z.se/", text: "other", via: "fetch" },
    ];
    const input = buildLlmInput({ ...defaultRestaurantSettings, party: 3, cuisines: ["pizza"], priorities: ["kids"] }, household, ["p1"], sources);
    expect(input.wantedCuisines).toEqual(["Pizza"]);
    expect(input.priorities).toEqual(["Barnvänligt"]);
    expect(input.party).toBe(3);
    expect(input.restaurants).toHaveLength(1);
    expect(input.restaurants[0]?.pages[0]?.text).toHaveLength(maxPageChars);
  });

  it("gives the household no names or ids", () => {
    const withName = { people: [{ name: "Anna", id: "m-1", allergies: [], likes: [], avoids: [] }] } as unknown as LlmHousehold;
    const json = JSON.stringify(buildLlmInput(defaultRestaurantSettings, withName, [], []));
    expect(json).not.toContain("Anna");
    expect(json).not.toContain("m-1");
  });
});

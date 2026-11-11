import { describe, expect, it } from "vitest";
import { buildLlmInput, type LlmHousehold } from "./llm-input";
import { defaultRestaurantSettings } from "./types";

// What the model is told by us (domain/types.ts): the typed place, the party, the wishes and the household's tastes. It
// then reads web pages through the search tool, which are untrusted data (the prompt says so).

const household: LlmHousehold = { people: [{ allergies: ["gluten"], likes: ["pizza"], avoids: ["koriander"] }] };

describe("buildLlmInput", () => {
  it("has a fixed set of keys and no coordinates", () => {
    const input = buildLlmInput(defaultRestaurantSettings, household, "Uppsala");
    expect(Object.keys(input).sort()).toEqual(["household", "party", "place", "priorities", "radiusM", "wantedCuisines", "when"]);
    expect(input.place).toBe("Uppsala");
    const json = JSON.stringify(input).toLowerCase();
    for (const word of ["lat", "lng", "google", "coords", "nominatim"]) expect(json).not.toContain(word);
  });
  it("passes the wishes as labels", () => {
    const input = buildLlmInput({ ...defaultRestaurantSettings, party: 3, radiusM: 2000, when: "lunch", cuisines: ["pizza"], priorities: ["kids"] }, household, "Lund");
    expect(input.radiusM).toBe(2000);
    expect(input.when).toBe("lunch");
    expect(input.wantedCuisines).toEqual(["Pizza"]);
    expect(input.priorities).toEqual(["Barnvänligt"]);
    expect(input.party).toBe(3);
  });
  it("gives the household no names or ids, and allergies only as words for the model to steer clear of", () => {
    const withName = { people: [{ name: "Anna", id: "m-1", allergies: ["nötter"], likes: [], avoids: [] }] } as unknown as LlmHousehold;
    const input = buildLlmInput(defaultRestaurantSettings, withName, "Lund");
    const json = JSON.stringify(input);
    expect(json).not.toContain("Anna");
    expect(json).not.toContain("m-1");
    expect(input.household.people[0]?.allergies).toEqual(["nötter"]);
  });
});

import { describe, expect, it } from "vitest";
import { LOCATIONS } from "@/features/catalog";
import { emptyPlaceText, itemCountText, placeFromSlug, placeSlug } from "./places";

describe("placeSlug and placeFromSlug", () => {
  it("round-trips every location", () => {
    for (const location of LOCATIONS) expect(placeFromSlug(placeSlug(location))).toBe(location);
    expect(LOCATIONS.map(placeSlug)).toEqual(["kyl", "frys", "skafferi"]);
  });

  it("makes an unknown, repeated or missing value Kyl", () => {
    expect(placeFromSlug(undefined)).toBe("Kyl");
    expect(placeFromSlug("")).toBe("Kyl");
    expect(placeFromSlug("Frys")).toBe("Kyl");
    expect(placeFromSlug("garage")).toBe("Kyl");
    expect(placeFromSlug(["frys", "skafferi"])).toBe("Kyl");
  });
});

describe("itemCountText", () => {
  it("says vara for one and varor otherwise", () => {
    expect(itemCountText(0)).toBe("0 varor");
    expect(itemCountText(1)).toBe("1 vara");
    expect(itemCountText(12)).toBe("12 varor");
  });
});

describe("emptyPlaceText", () => {
  it("names the location in definite form", () => {
    expect(emptyPlaceText("Kyl")).toBe("Inget i kylen än.");
    expect(emptyPlaceText("Frys")).toBe("Inget i frysen än.");
    expect(emptyPlaceText("Skafferi")).toBe("Inget i skafferiet än.");
  });
});

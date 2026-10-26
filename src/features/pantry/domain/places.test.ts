import { describe, expect, it } from "vitest";
import { LOCATIONS } from "@/features/catalog";
import {
  confirmedItemsText,
  emptyPlaceText,
  itemCountText,
  placeFromSlug,
  placeSlug,
  rejectedItemText,
  removedItemsText,
  savedItemText,
} from "./places";

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

describe("savedItemText", () => {
  it("names the item and the location in definite form", () => {
    expect(savedItemText("Mjölk", "Kyl")).toBe("Mjölk är sparad i kylen.");
    expect(savedItemText("Ärtor", "Frys")).toBe("Ärtor är sparad i frysen.");
    expect(savedItemText("Salt", "Skafferi")).toBe("Salt är sparad i skafferiet.");
  });
});

describe("removedItemsText", () => {
  it("names one or two items, and counts more", () => {
    expect(removedItemsText(["Mjölk"])).toBe("Mjölk är borttagen.");
    expect(removedItemsText(["Mjölk", "Smör"])).toBe("Mjölk och Smör är borttagna.");
    expect(removedItemsText(["Mjölk", "Smör", "Salt"])).toBe("3 varor är borttagna.");
  });
});

describe("confirmedItemsText and rejectedItemText", () => {
  it("counts the confirmed suggestions", () => {
    expect(confirmedItemsText(1)).toBe("Lagt 1 vara i lagret.");
    expect(confirmedItemsText(4)).toBe("Lagt 4 varor i lagret.");
  });

  it("names the rejected suggestion", () => {
    expect(rejectedItemText("ketchup")).toBe("ketchup är avvisad.");
  });
});

import { describe, expect, it } from "vitest";
import { LOCATIONS } from "@/features/catalog";
import {
  alreadyEmptyText,
  confirmedItemsText,
  emptiedPlaceText,
  emptyPlaceButtonText,
  emptyPlaceQuestion,
  emptyPlaceText,
  emptyPlaceUndoHint,
  maybeEmptiedText,
  notRestoredText,
  removedCountText,
  itemCountText,
  placeFromSlug,
  placeSlug,
  rejectedItemText,
  removedItemsText,
  savedItemText,
  keptItemText,
  alreadyRemovedText,
  inventoryAppliedText,
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

describe("the texts for emptying a location", () => {
  it("names the button, sheet and its button after the location", () => {
    expect(LOCATIONS.map(emptyPlaceButtonText)).toEqual(["Töm kylen", "Töm frysen", "Töm skafferiet"]);
  });

  it("asks about all items, or the one item", () => {
    expect(emptyPlaceQuestion("Kyl", 14)).toBe("Ta bort alla 14 varor i kylen?");
    expect(emptyPlaceQuestion("Frys", 2)).toBe("Ta bort alla 2 varor i frysen?");
    expect(emptyPlaceQuestion("Kyl", 1)).toBe("Ta bort 1 vara i kylen?");
    expect(emptyPlaceQuestion("Skafferi", 1)).toBe("Ta bort 1 vara i skafferiet?");
    expect(emptyPlaceUndoHint).toBe("Du kan ångra direkt efteråt.");
  });

  it("confirms with the number removed and the location", () => {
    expect(emptiedPlaceText("Kyl", 14)).toBe("Tog bort 14 varor ur kylen.");
    expect(emptiedPlaceText("Kyl", 1)).toBe("Tog bort 1 vara ur kylen.");
    expect(emptiedPlaceText("Skafferi", 3)).toBe("Tog bort 3 varor ur skafferiet.");
  });

  it("says when the location was empty already, in the location's gender", () => {
    expect(LOCATIONS.map(alreadyEmptyText)).toEqual([
      "Kylen är redan tom.",
      "Frysen är redan tom.",
      "Skafferiet är redan tomt.",
    ]);
  });

  it("counts removals undone together, with the location when there is one", () => {
    expect(removedCountText(15, ["Kyl", "Kyl"])).toBe("Tog bort 15 varor ur kylen.");
    expect(removedCountText(17, ["Kyl", "Frys"])).toBe("Tog bort 17 varor.");
    expect(removedCountText(1, [])).toBe("Tog bort 1 vara.");
  });

  it("says a location may have been emptied when the answer was lost", () => {
    expect(LOCATIONS.map(maybeEmptiedText)).toEqual(["Kylen kan ha tömts.", "Frysen kan ha tömts.", "Skafferiet kan ha tömts."]);
  });

  it("counts the items Ångra could not put back", () => {
    expect(notRestoredText(1)).toBe("1 vara gick inte att ångra.");
    expect(notRestoredText(2)).toBe("2 varor gick inte att ångra.");
  });
});

describe("Inventera en plats med foto", () => {
  it("says an item stays, or was gone already", () => {
    expect(keptItemText("senap", "Kyl")).toBe("senap står kvar i kylen.");
    expect(keptItemText("ärtor", "Frys")).toBe("ärtor står kvar i frysen.");
    expect(alreadyRemovedText("yoghurt")).toBe("yoghurt är redan borttagen.");
  });

  it("counts what Bekräfta alla did, leaving out the parts that are 0, in the location's gender", () => {
    expect(inventoryAppliedText("Kyl", { added: 3, changed: 1, removed: 2 })).toBe(
      "Kylen är uppdaterad: 3 nya, 1 ändrad och 2 borttagna.",
    );
    expect(inventoryAppliedText("Frys", { added: 1, changed: 2, removed: 1 })).toBe(
      "Frysen är uppdaterad: 1 ny, 2 ändrade och 1 borttagen.",
    );
    expect(inventoryAppliedText("Skafferi", { added: 0, changed: 0, removed: 2 })).toBe("Skafferiet är uppdaterat: 2 borttagna.");
    expect(inventoryAppliedText("Kyl", { added: 2, changed: 0, removed: 1 })).toBe("Kylen är uppdaterad: 2 nya och 1 borttagen.");
    expect(inventoryAppliedText("Kyl", { added: 0, changed: 0, removed: 0 })).toBe("Kylen är uppdaterad.");
  });
});

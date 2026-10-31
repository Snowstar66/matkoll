import { describe, expect, it } from "vitest";
import {
  cleanPlaceName,
  groupByRoom,
  maxPlaceNameChars,
  normalizePlaceName,
  partLabel,
  placeInputSchema,
  placeTitle,
  boxKey,
  isBoxKey,
  roomSuggestions,
  thingCountText,
  type ThingPlace,
} from "./thing-place";

const place = (room: string, part: string | null = null, id = `${room}-${part}`): ThingPlace => ({
  id,
  siteId: "s",
  room,
  part,
  isBox: false,
  itemCount: 0,
  cardTakenAt: null,
  cardState: "none",
});

describe("names", () => {
  it("normalizes on one line, trimmed, NFC and lower case as Swedish has it", () => {
    expect(normalizePlaceName("  Skräp  förrådet ")).toBe("skräp förrådet");
    expect(normalizePlaceName("ÅSA\u200b")).toBe("åsa");
    expect(normalizePlaceName("Å".normalize("NFD"))).toBe("å");
    expect(cleanPlaceName("  Översta\nhyllan ")).toBe("Översta hyllan");
  });

  it("accepts a room and an optional part, and makes an empty part none", () => {
    expect(placeInputSchema.parse({ siteId: crypto.randomUUID(), room: " Garaget ", part: "  " })).toMatchObject({ room: "Garaget", part: null });
    expect(placeInputSchema.parse({ siteId: crypto.randomUUID(), room: "Garaget", part: "Väggen" }).part).toBe("Väggen");
  });

  it("refuses an empty or too long room, a too long part and a siteId that is not a uuid", () => {
    const id = crypto.randomUUID();
    expect(placeInputSchema.safeParse({ siteId: id, room: "  ", part: "" }).success).toBe(false);
    expect(placeInputSchema.safeParse({ siteId: id, room: "x".repeat(maxPlaceNameChars + 1), part: "" }).success).toBe(false);
    expect(placeInputSchema.safeParse({ siteId: id, room: "x".repeat(maxPlaceNameChars), part: "" }).success).toBe(true);
    expect(placeInputSchema.safeParse({ siteId: id, room: "Garaget", part: "y".repeat(maxPlaceNameChars + 1) }).success).toBe(false);
    expect(placeInputSchema.safeParse({ siteId: "x", room: "Garaget", part: "" }).success).toBe(false);
  });
});

describe("the list", () => {
  it("groups the places by room in the order the rooms were made, in any spelling", () => {
    const groups = groupByRoom([place("Skräpförrådet", "Översta hyllan"), place("Garaget", null), place("skräpförrådet ", "Golvet")]);
    expect(groups.map((group) => [group.room, group.places.map(partLabel)])).toEqual([
      ["Skräpförrådet", ["Översta hyllan", "Golvet"]],
      ["Garaget", ["Hela rummet"]],
    ]);
  });

  it("suggests each room once, sorted", () => {
    expect(roomSuggestions([place("Skräpförrådet"), place("garaget"), place("Skräpförrådet ", "Golvet"), place("Åkerboden")])).toEqual([
      "garaget",
      "Skräpförrådet",
      "Åkerboden",
    ]);
  });

  it("writes a place as its room and part, and counts things", () => {
    expect(placeTitle(place("Skräpförrådet", "Översta hyllan"))).toBe("Skräpförrådet · Översta hyllan");
    expect(placeTitle(place("Garaget"))).toBe("Garaget");
    expect(thingCountText(1)).toBe("1 sak");
    expect(thingCountText(12)).toBe("12 saker");
  });
});

describe("boxes", () => {
  it("are told by their key, which no plain part has", () => {
    expect(boxKey("  Blå  Backen ")).toBe("box:blå backen");
    expect(isBoxKey(boxKey("Blå backen"))).toBe(true);
    expect(isBoxKey(normalizePlaceName("Blå backen"))).toBe(false);
    expect(isBoxKey("")).toBe(false);
  });

  it("have a title that says the thing is in the box", () => {
    expect(placeTitle({ room: "Skräpförrådet", part: "Blå backen", isBox: true })).toBe("Skräpförrådet, i Blå backen");
    expect(placeTitle({ room: "Skräpförrådet", part: "Blå backen" })).toBe("Skräpförrådet · Blå backen");
  });
});

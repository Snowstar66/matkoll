import { describe, expect, it } from "vitest";
import { captureInputSchema, sendingText, sentText } from "./capture";
import {
  cardLabel,
  cardMeta,
  orderCategories,
  parseRoomView,
  roomMeta,
  roomsTotalText,
  roomThingHint,
  roomTile,
  thingsText,
  toRoomThing,
  type RoomSummary,
} from "./thing-room";

const room = (over: Partial<RoomSummary> = {}): RoomSummary => ({
  room: "Skräpförrådet",
  key: "skräpförrådet",
  things: 74,
  cards: 9,
  reading: 0,
  latest: new Date("2026-10-31T10:00:00Z"),
  ...over,
});

describe("the rooms", () => {
  it("say things, cards and the newest date, and the sum above", () => {
    expect(roomMeta(room())).toBe("74 prylar · 9 kort · 31 okt");
    expect(roomMeta(room({ things: 1, cards: 1 }))).toBe("1 pryl · 1 kort · 31 okt");
    expect(roomMeta(room({ cards: 0, things: 0, latest: null }))).toBe("Inget kort än");
    expect(roomMeta(room({ cards: 0, things: 0, latest: null, reading: 1 }))).toBe("Tittar på kortet …");
    expect(roomsTotalText([room(), room({ things: 38 })])).toBe("2 rum · 112 prylar");
    expect(roomsTotalText([room({ things: 1 })])).toBe("1 rum · 1 pryl");
    expect(thingsText(0)).toBe("0 prylar");
  });

  it("get a tile by their name", () => {
    expect(roomTile("Garaget").icon).toBe("\u{1F697}");
    expect(roomTile("Boden").icon).toBe("\u{1F33F}");
    expect(roomTile("Skräpförrådet").icon).toBe("\u{1F4E6}");
  });
});

describe("the cards", () => {
  it("are labelled by what they show", () => {
    expect(cardLabel({ part: null, kind: "part" })).toBe("Hela rummet");
    expect(cardLabel({ part: "Väggen", kind: "part" })).toBe("Väggen");
    expect(cardLabel({ part: "Black box", kind: "box" })).toBe("Låda: Black box");
    expect(cardMeta({ things: 26, takenAt: new Date("2026-10-31T10:00:00Z") })).toBe("26 prylar · 31 okt");
  });
});

describe("a thing's hint in the room's list", () => {
  it("is the box, then 'syns på 2 kort', then where on the photo", () => {
    expect(roomThingHint({ kind: "box", part: "Blå backen", whereHint: "överst", seenOn: 1 })).toBe("i Blå backen");
    expect(roomThingHint({ kind: "part", part: "Väggen", whereHint: "väggen", seenOn: 2 })).toBe("syns på 2 kort");
    expect(roomThingHint({ kind: "part", part: null, whereHint: "väggen", seenOn: 1 })).toBe("väggen");
    expect(roomThingHint({ kind: "part", part: null, whereHint: null, seenOn: 1 })).toBeNull();
    expect(toRoomThing({ id: "i", name: "Hammare", category: "Verktyg", confidence: "high", whereHint: "väggen", part: null, kind: "part", seenOn: 1 }).whereHint).toBe("väggen");
  });

  it("orders the categories like the lists do and leaves empty ones out", () => {
    expect(orderCategories([{ category: "Hushåll", things: 3 }, { category: "Verktyg", things: 18 }, { category: "Okänd", things: 1 }, { category: "Trädgård", things: 0 }])).toEqual([
      { category: "Verktyg", things: 18 },
      { category: "Hushåll", things: 3 },
    ]);
  });

  it("reads the view from the address", () => {
    expect(parseRoomView("cards")).toBe("cards");
    expect(parseRoomView("x")).toBe("things");
    expect(parseRoomView(undefined)).toBe("things");
  });
});

describe("Ta kort", () => {
  it("needs a room, and takes an optional part or box", () => {
    const site = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
    expect(captureInputSchema.safeParse({ siteId: site, room: "  ", part: "", box: false }).success).toBe(false);
    expect(captureInputSchema.parse({ siteId: site, room: " Garaget ", part: "", box: false })).toEqual({ siteId: site, room: "Garaget", part: null, box: false });
    expect(captureInputSchema.parse({ siteId: site, room: "Garaget", part: "Blå backen", box: true }).part).toBe("Blå backen");
    expect(captureInputSchema.safeParse({ siteId: site, room: "x".repeat(41), part: "", box: false }).success).toBe(false);
  });

  it("says how many cards are sent and read", () => {
    expect(sendingText(0, 1)).toBe("Skickar kortet …");
    expect(sendingText(1, 5)).toBe("Skickar 2 av 5 …");
    expect(sentText(1)).toBe("Kortet läses i bakgrunden.");
    expect(sentText(3)).toBe("3 kort läses i bakgrunden.");
  });
});

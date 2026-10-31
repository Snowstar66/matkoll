import { describe, expect, it } from "vitest";
import { cleanThingName, renameInputSchema } from "./thing-edit";
import { hitHref, hitMeta, searchKey, searchRowsSchema, searchTerms, toHit, type ThingHit } from "./thing-search";

const hit = (extra: Partial<ThingHit> = {}): ThingHit => ({
  id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
  name: "Cirkelsåg",
  category: "Verktyg",
  whereHint: null,
  seenOn: 1,
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02",
  siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03",
  siteName: "Hemma",
  room: "Skräpförrådet",
  roomKey: "skräpförrådet",
  part: "Översta hyllan",
  isBox: false,
  photoId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04",
  takenAt: "2026-10-31T10:00:00Z",
  written: false,
  score: 1,
  ...extra,
});

describe("searchTerms", () => {
  it("is the text and each word of two letters or more, once each", () => {
    expect(searchTerms("  Röd  HAMMARE ")).toEqual(["röd hammare", "röd", "hammare"]);
    expect(searchTerms("hammare")).toEqual(["hammare"]);
    expect(searchTerms("a b")).toEqual(["a b"]);
  });

  it("is nothing for an empty text, and keeps to 40 characters a term and a few words", () => {
    expect(searchTerms("   ")).toEqual([]);
    expect(searchTerms("x".repeat(41))).toEqual([]);
    expect(searchTerms("aa bb cc dd ee ff gg hh").length).toBeLessThanOrEqual(7);
  });

  it("compares in NFC and Swedish lower case", () => {
    expect(searchKey("  ÅKA  Sparkcykel ")).toBe("åka sparkcykel");
  });
});

describe("a hit", () => {
  it("is written as place, boende and the card's day", () => {
    expect(hitMeta(hit())).toBe("Skräpförrådet, Översta hyllan · Hemma · 31 okt");
    expect(hitMeta(hit({ whereHint: "väggen" }))).toBe("Skräpförrådet, Översta hyllan, väggen · Hemma · 31 okt");
    // A thing the room's cards overlap on is listed once and says so (Story 18.6).
    expect(hitMeta(hit({ seenOn: 2 }))).toBe("Skräpförrådet, Översta hyllan · Hemma · 31 okt · syns på 2 kort");
  });

  it("says 'i Blå backen' for a thing in a box, and 'skrivet' for one written into it, which opens the box's page", () => {
    const written = hit({ part: "Blå backen", isBox: true, photoId: null, written: true });
    expect(hitMeta(written)).toBe("Skräpförrådet, i Blå backen · Hemma · skrivet 31 okt");
    expect(hitHref(written)).toBe(`/prylar/lada/${written.placeId}`);
    const photographed = hit({ part: "Blå backen", isBox: true });
    expect(hitMeta(photographed)).toContain("Skräpförrådet, i Blå backen ·");
    expect(hitHref(photographed)).toBe(`/prylar/${photographed.placeId}`);
  });

  it("is read from a row of search_things, with or without a card", () => {
    const row = {
      id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
      name: "Skiftnyckel",
      category: "Verktyg",
      where_hint: null,
      photo_id: null,
      place_id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02",
      site_id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03",
      site_name: "Hemma",
      room: "Garaget",
      room_key: "garaget",
      part: "Black box",
      kind: "box",
      taken_at: "2026-10-31T10:00:00+00:00",
      source: "manual",
      score: 0.75,
      seen_on: 1,
    };
    const parsed = searchRowsSchema.parse([row]);
    expect(toHit(parsed[0])).toMatchObject({ name: "Skiftnyckel", isBox: true, written: true, photoId: null, takenAt: "2026-10-31T10:00:00.000Z" });
    expect(searchRowsSchema.safeParse([{ ...row, category: "Mat" }]).success).toBe(false);
  });
});

describe("renaming a thing", () => {
  const id = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
  it("cleans the name to one line and keeps 1 to 80 characters", () => {
    expect(cleanThingName("  Stor \n hammare ")).toBe("Stor hammare");
    expect(renameInputSchema.parse({ id, name: " Hammare " }).name).toBe("Hammare");
    expect(renameInputSchema.safeParse({ id, name: " " }).success).toBe(false);
    expect(renameInputSchema.safeParse({ id, name: "x".repeat(81) }).success).toBe(false);
    expect(renameInputSchema.safeParse({ id, name: "x".repeat(80) }).success).toBe(true);
    expect(renameInputSchema.safeParse({ id: "nope", name: "Hammare" }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { questionWords, rankPlaces, refLabel, questionSchema } from "./thing-ask";
import { cleanThingName, renameInputSchema } from "./thing-edit";
import { hitMeta, maxHits, searchKey, searchThings, type IndexedPlace } from "./thing-search";

const place = (id: string, room: string, names: string[], extra: Partial<IndexedPlace> = {}): IndexedPlace => ({
  id,
  siteId: "s1",
  siteName: "Hemma",
  room,
  part: null,
  isBox: false,
  cardTakenAt: new Date("2026-10-31T10:00:00Z"),
  hidden: 0,
  things: names.map((name, index) => ({ id: `${id}-${index}`, name, category: "Verktyg", whereHint: null, seenOn: 1 })),
  ...extra,
});

describe("searchThings", () => {
  const places = [
    place("a", "Skräpförrådet", ["Cirkelsåg", "Hammare", "Spik och hammarskaft"], { part: "Översta hyllan" }),
    place("b", "Garaget", ["Blå back", "Hammarborrmaskin"]),
  ];

  it("finds things by any part of the name, in any case, across all places", () => {
    const { hits, total } = searchThings(places, "HAMMA");
    expect(total).toBe(3);
    // A name that starts with the word comes first, each group by name.
    expect(hits.map((hit) => hit.thing.name)).toEqual(["Hammarborrmaskin", "Hammare", "Spik och hammarskaft"]);
  });

  it("needs every word, and matches the category too", () => {
    expect(searchThings(places, "blå back").hits.map((hit) => hit.thing.name)).toEqual(["Blå back"]);
    expect(searchThings(places, "back hammare").total).toBe(0);
    expect(searchThings(places, "verktyg").total).toBe(5);
  });

  it("finds nothing for an empty query", () => {
    expect(searchThings(places, "  ")).toEqual({ hits: [], total: 0 });
  });

  it("caps the hits and says how many matched", () => {
    const many = [place("c", "Rum", Array.from({ length: maxHits + 20 }, (_, index) => `Skruv ${index}`))];
    const result = searchThings(many, "skruv");
    expect(result.hits).toHaveLength(maxHits);
    expect(result.total).toBe(maxHits + 20);
  });

  it("writes a hit as place, boende and the card's day", () => {
    const [hit] = searchThings(places, "cirkel").hits;
    expect(hitMeta(hit)).toBe("Skräpförrådet, Översta hyllan · Hemma · 31 okt");
    const withWhere = { ...hit, thing: { ...hit.thing, whereHint: "väggen" } };
    expect(`${hit.thing.name} · ${hitMeta(withWhere)}`).toBe("Cirkelsåg · Skräpförrådet, Översta hyllan, väggen · Hemma · 31 okt");
    // A thing the room's cards overlap on is listed once and says so (Story 18.6).
    const merged = { ...hit, thing: { ...hit.thing, seenOn: 2 } };
    expect(hitMeta(merged)).toBe("Skräpförrådet, Översta hyllan · Hemma · 31 okt · syns på 2 kort");
  });

  it("compares in NFC and Swedish lower case", () => {
    expect(searchKey("  ÅKA  Sparkcykel ")).toBe("åka sparkcykel");
    expect(searchKey("å")).toBe("å");
  });
});

describe("the question", () => {
  it("is cleaned to one line and limited", () => {
    expect(questionSchema.parse("  Har  vi\nhammare? ")).toBe("Har vi hammare?");
    expect(questionSchema.safeParse("   ").success).toBe(false);
    expect(questionSchema.safeParse("x".repeat(301)).success).toBe(false);
  });

  it("has words of three letters or more", () => {
    expect(questionWords("Har vi något att måla med?")).toEqual(["måla"]);
  });

  it("puts the places that fit the question first, then the newest card", () => {
    const places = [
      place("old", "Gamla", ["Spade"], { cardTakenAt: new Date("2026-01-01T00:00:00Z") }),
      place("new", "Nya", ["Kratta"]),
      place("paint", "Målarrummet", ["Målarfärgsburkar"], { cardTakenAt: new Date("2026-02-01T00:00:00Z") }),
    ];
    expect(rankPlaces(places, "Något att måla med?").map((entry) => entry.id)).toEqual(["paint", "new", "old"]);
  });

  it("labels a place for its chip", () => {
    expect(refLabel({ room: "Skräpförrådet", part: null, siteName: "Hemma", cardTakenAt: new Date("2026-10-31T10:00:00Z") })).toBe(
      "Skräpförrådet · Hemma · 31 okt",
    );
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

describe("things in a box", () => {
  it("say where they are as 'i Blå backen'", () => {
    const box = place("b", "Skräpförrådet", ["Julgransprydnad"], { part: "Blå backen", isBox: true });
    const [hit] = searchThings([box], "julgran").hits;
    expect(hitMeta(hit)).toContain("Skräpförrådet, i Blå backen ·");
  });
});

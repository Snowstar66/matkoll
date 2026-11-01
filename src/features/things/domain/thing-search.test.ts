import { describe, expect, it } from "vitest";
import { cleanThingName, renameInputSchema } from "./thing-edit";
import {
  hitHref,
  hitThumbnail,
  hitLine,
  hitMeta,
  hitRank,
  isPlainSearch,
  plainSearchAnswer,
  rankHits,
  searchKey,
  searchRowsSchema,
  searchTerms,
  showSimilarText,
  stripQuestionFrame,
  isStrongMatch,
  countPlaceText,
  toHit,
  type ThingHit,
} from "./thing-search";

const hit = (extra: Partial<ThingHit> = {}): ThingHit => ({
  quantity: null,
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
  noted: false,
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
    // Story 18.7: a thing on a card opens the card big with the thing marked.
    expect(hitHref(photographed)).toBe(`/prylar/kort/${photographed.photoId}?foremal=${photographed.id}`);
    expect(hitThumbnail(photographed)).toBe(`/api/things/photo/${photographed.photoId}`);
    expect(hitThumbnail(written)).toBeNull();
    // A noted thing (Story 18.19) has no card: it opens its room and has no thumbnail (its note shows).
    const noted = hit({ noted: true, photoId: null });
    expect(hitHref(noted)).toBe(`/prylar/${noted.placeId}`);
    expect(hitThumbnail(noted)).toBeNull();
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

describe("a plain search and its best hits (Story 18.19)", () => {
  it("takes one to three words without a question as a search", () => {
    for (const text of ["coca-cola", "passen", "skruvdragare", "röd cykelpump", "  Blå   backen  ", "vinter däck sommar"]) expect(isPlainSearch(text), text).toBe(true);
    for (const text of ["var är passen", "vart är passen", "letar efter passen", "ja", "nej", "passen?", "har vi tejp", "hur många skruvar", "finns tejp", "och tången", "passen ligger här", "en två tre fyra", "", "  ", "?"]) {
      expect(isPlainSearch(text), text).toBe(false);
    }
  });

  it("ranks the same name first, then the start, then a name that holds it, and a close match not at all", () => {
    expect(hitRank("coca-cola", "Coca-Cola")).toBe(3);
    // The definite form finds the name a noted thing is saved with.
    expect(hitRank("passen", "Pass")).toBe(3);
    expect(hitRank("skruvdragaren", "Skruvdragare")).toBe(2);
    expect(rankHits("passen", [hit({ name: "Pass" })]).best).toHaveLength(1);
    expect(hitRank("coca cola", "Coca-Cola")).toBe(3);
    expect(hitRank("skruv", "Skruvdragare")).toBe(2);
    expect(hitRank("nyckel", "Skiftnyckel")).toBe(1);
    expect(hitRank("röd pump", "Röd cykelpump")).toBe(1);
    expect(hitRank("coca-cola", "Fun Light läsk")).toBe(0);
    expect(hitRank("kratha", "Kratta")).toBe(0);
    expect(hitRank("", "Kratta")).toBe(0);
  });

  it("splits the hits into the answer and Liknande, best first", () => {
    const names = ["Fun Light läsk", "Skiftnyckel", "Nyckelring", "Nyckel"].map((name) => hit({ id: crypto.randomUUID(), name }));
    const { best, similar } = rankHits("nyckel", names);
    expect(best.map((entry) => entry.name)).toEqual(["Nyckel", "Nyckelring", "Skiftnyckel"]);
    expect(similar.map((entry) => entry.name)).toEqual(["Fun Light läsk"]);
    expect(showSimilarText(5)).toBe("Visa 5 liknande");
  });

  it("answers first and short", () => {
    const pass = hit({ name: "Pass", room: "Sovrummet", part: "Översta byrålådan" });
    expect(plainSearchAnswer("passen", [pass])).toBe("Pass finns i Sovrummet · Översta byrålådan.");
    expect(plainSearchAnswer("pass", [pass, pass])).toBe("Hittade 2 föremål.");
    // The close matches have their own heading Liknande right under the answer.
    expect(plainSearchAnswer(" coca-cola ", [])).toBe("Ingen \u201Dcoca-cola\u201D hittad.");
  });

  it("gives a hit's line: where, the boende only when it is another, and the day only for a thing written in", () => {
    const card = hit({ room: "Boden", part: "Nedersta hyllan", whereHint: "mitten", siteName: "Stugan" });
    expect(hitLine(card)).toBe("Boden · Nedersta hyllan · mitten");
    expect(hitLine(card, card.siteId)).toBe("Boden · Nedersta hyllan · mitten");
    expect(hitLine(card, "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6aff")).toBe("Boden · Nedersta hyllan · mitten · Stugan");
    expect(hitLine(hit({ room: "Sovrummet", part: "Byrån", noted: true, photoId: null, takenAt: "2026-10-31T10:00:00Z" }))).toBe("Sovrummet · Byrån · skrivet 31 okt");
  });
});


describe("stripQuestionFrame (Story 18.23)", () => {
  it("takes the frame off a short question, so the database can answer it", () => {
    expect(stripQuestionFrame("har vi gravljus")).toBe("gravljus");
    expect(stripQuestionFrame("Finns det gravljus hemma?")).toBe("gravljus");
    expect(stripQuestionFrame("finns det några batterier kvar")).toBe("batterier");
    expect(stripQuestionFrame("var är gravljusen")).toBe("gravljusen");
    expect(stripQuestionFrame("Var ligger passen?")).toBe("passen");
    expect(stripQuestionFrame("har vi glödlampor e27")).toBe("glödlampor e27");
    expect(stripQuestionFrame("hittar du hammaren")).toBe("hammaren");
  });

  it("leaves a text without a frame, or a real question, to the rest", () => {
    expect(stripQuestionFrame("gravljus")).toBeNull();
    expect(stripQuestionFrame("har vi")).toBeNull();
    expect(stripQuestionFrame("har vi tejp och lim")).toBeNull();
    expect(stripQuestionFrame("har vi något att laga cykeln med")).toBeNull();
    expect(stripQuestionFrame("var är det bäst att ha verktygen")).toBeNull();
    expect(stripQuestionFrame("vad finns i garaget")).toBeNull();
    expect(stripQuestionFrame("Har vi något att måla med?")).toBeNull();
  });
});

describe("isStrongMatch and countPlaceText (Story 18.23)", () => {
  it("is sure only for the name itself, or one or two words the name starts with", () => {
    expect(isStrongMatch("gravljus", "Gravljus")).toBe(true);
    expect(isStrongMatch("gravljusen", "Gravljus")).toBe(true);
    expect(isStrongMatch("glödlampor e27", "Glödlampor E27")).toBe(true);
    expect(isStrongMatch("glödlampor", "Glödlampor E27")).toBe(true);
    expect(isStrongMatch("gravljus i stugan", "Gravljus")).toBe(false);
    expect(isStrongMatch("batterier till fjärrkontrollen", "Batterier AA")).toBe(false);
    expect(isStrongMatch("ljus", "Värmeljus")).toBe(false);
  });

  it("names the boende only when asked to", () => {
    const where = { room: "Förrådet", part: "Översta hyllan", isBox: false, siteName: "Stugan" };
    expect(countPlaceText(where, false)).toBe("Förrådet · Översta hyllan");
    expect(countPlaceText(where, true)).toBe("Förrådet · Översta hyllan (Stugan)");
  });
});

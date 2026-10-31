import { describe, expect, it } from "vitest";
import { groupHits, refOfGroup } from "./thing-ask";
import {
  capitalizeFirst,
  matchRoom,
  movedFromText,
  notedHint,
  notedSheetSubtitle,
  notedSubText,
  notedTitle,
  proposePlace,
  rememberedText,
  rememberInputSchema,
} from "./thing-noted";
import { toRoomThing } from "./thing-room";
import { hitDateText, hitHref, hitMeta, searchRowsSchema, toHit, type ThingHit } from "./thing-search";

const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03";
const rooms = [
  { room: "Skräpförrådet", parts: [] },
  { room: "Sovrummet", parts: ["Garderoben", "Översta byrålådan"] },
  { room: "Garaget", parts: [] },
];

describe("where a thing to remember goes (Story 18.19)", () => {
  it("uses the boende's room in its spelling, also in another form, and its part when there is one", () => {
    expect(proposePlace(rooms, { room: "sovrummet", part: "översta byrålådan" })).toEqual({ room: "Sovrummet", part: "Översta byrålådan", newRoom: false });
    expect(proposePlace(rooms, { room: "Sovrum", part: "garderoben" })).toEqual({ room: "Sovrummet", part: "Garderoben", newRoom: false });
    expect(proposePlace(rooms, { room: "garage", part: null })).toEqual({ room: "Garaget", part: null, newRoom: false });
  });

  it("makes a new room and part with a capital first letter, and keeps a missing room missing", () => {
    expect(proposePlace(rooms, { room: "vinden", part: "blå lådan" })).toEqual({ room: "Vinden", part: "Blå lådan", newRoom: true });
    expect(proposePlace(rooms, { room: "Sovrummet", part: "  nattduksbordet " })).toEqual({ room: "Sovrummet", part: "Nattduksbordet", newRoom: false });
    expect(proposePlace(rooms, { room: null, part: "en låda" })).toEqual({ room: null, part: "En låda", newRoom: false });
    expect(proposePlace(rooms, { room: " ", part: null })).toEqual({ room: null, part: null, newRoom: false });
  });

  it("matches a room by its key, or by its stem only when one room has it", () => {
    expect(matchRoom(rooms, "SKRÄPFÖRRÅDET")?.room).toBe("Skräpförrådet");
    expect(matchRoom([{ room: "Hallen" }, { room: "Hall" }], "hallen")?.room).toBe("Hallen");
    expect(matchRoom([{ room: "Hallen" }, { room: "Halle" }], "hall")).toBeNull();
    expect(matchRoom(rooms, "Köket")).toBeNull();
    // Either side may be the base form.
    expect(matchRoom([{ room: "Altan" }], "altanen")?.room).toBe("Altan");
    expect(matchRoom([{ room: "Altanen" }], "Altan")?.room).toBe("Altanen");
  });

  it("capitalizes the first letter only", () => {
    expect(capitalizeFirst("översta byrålådan")).toBe("Översta byrålådan");
    expect(capitalizeFirst("")).toBe("");
  });
});

describe("what Kom ihåg sends", () => {
  const valid = { siteId, name: "  Pass ", room: " Sovrummet", part: "", category: "Övrigt", replaces: null };

  it("cleans the names, and an empty part is the whole room", () => {
    expect(rememberInputSchema.parse(valid)).toEqual({ siteId, name: "Pass", room: "Sovrummet", part: null, category: "Övrigt", replaces: null });
    expect(rememberInputSchema.parse({ ...valid, part: null }).part).toBeNull();
    expect(rememberInputSchema.parse({ ...valid, part: "Byrån", replaces: siteId })).toMatchObject({ part: "Byrån", replaces: siteId });
  });

  it("refuses an empty or long name or room, a long part, an unknown category and a bad id", () => {
    const issue = (input: object) => rememberInputSchema.safeParse(input).error?.issues[0];
    expect(issue({ ...valid, name: " " })).toMatchObject({ path: ["name"], message: "empty" });
    expect(issue({ ...valid, name: "x".repeat(81) })).toMatchObject({ path: ["name"], message: "too long" });
    expect(issue({ ...valid, room: "" })).toMatchObject({ path: ["room"], message: "empty" });
    expect(issue({ ...valid, room: "x".repeat(41) })).toMatchObject({ path: ["room"], message: "too long" });
    expect(issue({ ...valid, part: "x".repeat(41) })).toMatchObject({ path: ["part"], message: "too long" });
    expect(issue({ ...valid, category: "Papper" })?.path).toEqual(["category"]);
    expect(issue({ ...valid, siteId: "x" })?.path).toEqual(["siteId"]);
    expect(issue({ ...valid, replaces: "x" })?.path).toEqual(["replaces"]);
  });
});

describe("the texts", () => {
  const day = new Date("2026-10-31T21:00:00Z");
  it("say where it is and when it was written in", () => {
    expect(notedTitle({ room: "Sovrummet", part: "Översta byrålådan" })).toBe("Sovrummet · Översta byrålådan");
    expect(notedTitle({ room: "Vinden", part: null })).toBe("Vinden");
    expect(rememberedText("Pass", "Sovrummet · Översta byrålådan")).toBe("Klart. Pass ligger i Sovrummet · Översta byrålådan.");
    expect(notedSubText(day)).toBe("Du skrev in det 31 okt");
    expect(notedHint("Översta byrålådan", day)).toBe("Översta byrålådan · skrivet 31 okt");
    expect(notedHint(null, day)).toBe("skrivet 31 okt");
    expect(notedSheetSubtitle("Översta byrålådan", day)).toBe("Du skrev in det 31 okt · Översta byrålådan");
    expect(movedFromText({ title: "Hallen · Byrån", notedAt: "2026-10-12T10:00:00Z" })).toBe("Låg förut i Hallen · Byrån (skrivet 12 okt).");
  });
});

describe("a noted thing in the room, the search and the chat", () => {
  it("shows its part and day in the room's list, and keeps no 'where on the picture'", () => {
    const thing = toRoomThing({
      id: siteId,
      name: "Pass",
      category: "Övrigt",
      confidence: "high",
      whereHint: null,
      part: "Översta byrålådan",
      kind: "part",
      seenOn: 1,
      notedAt: "2026-10-31T21:00:00.000Z",
    });
    expect(thing.whereHint).toBe("Översta byrålådan · skrivet 31 okt");
    expect(thing.noted).toEqual({ at: "2026-10-31T21:00:00.000Z", part: "Översta byrålådan" });
    expect(toRoomThing({ id: siteId, name: "Hammare", category: "Verktyg", confidence: "high", whereHint: "väggen", part: null, kind: "part", seenOn: 1 }).noted).toBeUndefined();
  });

  const row = {
    id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a21",
    name: "Pass",
    category: "Övrigt",
    where_hint: null,
    photo_id: null,
    place_id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a22",
    site_id: siteId,
    site_name: "Hemma",
    room: "Sovrummet",
    room_key: "sovrummet",
    part: "Översta byrålådan",
    kind: "part",
    taken_at: "2026-10-31T21:00:00Z",
    source: "photo",
    score: 1,
    seen_on: 1,
    noted: true,
  };

  it("is found by the search with its day, and opens its room", () => {
    const [hit] = searchRowsSchema.parse([row]).map(toHit);
    expect(hit.noted).toBe(true);
    expect(hit.written).toBe(false);
    expect(hitDateText(hit)).toBe("skrivet 31 okt");
    expect(hitMeta(hit)).toBe("Sovrummet, Översta byrålådan · Hemma · skrivet 31 okt");
    expect(hitHref(hit)).toBe(`/prylar/${row.place_id}`);
    // A row from a database before the migration has no `noted`: any other thing.
    const old: Omit<typeof row, "noted"> & { noted?: boolean } = { ...row };
    delete old.noted;
    expect(toHit(searchRowsSchema.parse([{ ...old, photo_id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a23" }])[0]).noted).toBe(false);
  });

  it("is a place of its own in the chat, with a note and the day it was written in", () => {
    const [hit] = searchRowsSchema.parse([row]).map(toHit);
    const box: ThingHit = { ...hit, id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a24", noted: false, written: true, isBox: true };
    const groups = groupHits([hit, box]);
    expect(groups.map((group) => group.key)).toEqual([`noted:${row.place_id}`, `box:${row.place_id}`]);
    expect(refOfGroup(groups[0])).toEqual({
      href: `/prylar/${row.place_id}`,
      photoId: null,
      title: "Sovrummet · Översta byrålådan",
      sub: "Du skrev in det 31 okt",
      noted: true,
    });
  });
});

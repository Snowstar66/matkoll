import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ThingsDataError } from "@/features/things/data/client";
import { loadThingsIn, removeItemIn, renameItemIn, restoreItemIn } from "@/features/things/data/items";
import {
  downloadCardFile,
  insertCardIn,
  loadCardsIn,
  loadSiteCardFilesIn,
  removeCardFileIfOrphan,
  removeCardIn,
  restoreCardIn,
  markCardFailedIn,
  removeCardFiles,
  reopenCardIn,
  saveReadingIn,
  uploadCardFile,
} from "@/features/things/data/photos";
import { sweepCardFilesIn } from "@/features/things/actions/sweep-card-files";
import { mergeItemsIn, loadMergeInputIn } from "@/features/things/data/merge";
import { loadUnseenIn, searchThingsIn } from "@/features/things/data/search";
import { loadRoomWrittenIn, loadWrittenIn, replaceBoxThingsIn } from "@/features/things/data/written";
import { insertPlaceIn, loadPlaceIn, loadPlacesIn } from "@/features/things/data/places";
import { findPlaceIn, loadRoomCardsIn, loadRoomCategoriesIn, loadRoomIn, loadRoomPlacesIn, loadRoomsIn, loadRoomThingsIn } from "@/features/things/data/rooms";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// Prylar against local Supabase with Storage (Stories 18.1 and 18.2, AD-4,
// AD-5, AD-26, NFR-11): places (the same room and part in another spelling are
// one place, a boende that is gone), cards (the file in the private bucket,
// `reading`, `failed` and "Försök igen"), save_thing_reading (the things are
// saved, the card is done, the older card of the place goes with its things
// and the paths of its file are given back, MK440 for a card that is gone, not
// the caller's or not being read), the cascade from a deleted boende, and
// that another user can reach nothing of it. The RLS of every table and the
// bucket is also in household-isolation.test.ts. Only drawn bytes, never a photo.

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

let a: TestUser;
let b: TestUser;
let c: TestUser;
const files: string[] = [];

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("things-a");
  b = await createTestUser("things-b");
  c = await createTestUser("things-c");
});

afterAll(async () => {
  await adminClient().storage.from(thingPhotoBucket).remove(files);
  await deleteTestUsers();
});

/** A boende of the user's; the first one is the selected one (a user with boenden has exactly one). */
const withSites = new Set<string>();
async function siteOf(user: TestUser, name = "Hemma"): Promise<string> {
  const first = !withSites.has(user.id);
  withSites.add(user.id);
  const { data, error } = await user.db
    .from("pantry_site")
    .insert({ name, normalized_name: `${name.toLowerCase()}-${randomUUID()}`, is_selected: first })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id;
}

async function placeOf(user: TestUser, siteId: string, room = "Skräpförrådet", part: string | null = null): Promise<string> {
  const saved = await insertPlaceIn(user.db, { siteId, room, part });
  if (saved.kind !== "saved") throw new Error(`not saved: ${saved.kind}`);
  return saved.id;
}

/** A card with its file, `reading`. */
async function cardOf(user: TestUser, placeId: string, createdAt?: string, replacesId?: string): Promise<{ id: string; path: string }> {
  const id = randomUUID();
  const path = thingPhotoPath(user.id, placeId, id, "image/png");
  await uploadCardFile(user.db, path, png, "image/png");
  files.push(path);
  const outcome = await insertCardIn(user.db, { id, placeId, objectPath: path, mediaType: "image/png", width: 10, height: 10, takenAt: new Date(), replacesId });
  expect(outcome).toBe("saved");
  if (createdAt) await adminClient().from("thing_photo").update({ created_at: createdAt }).eq("id", id);
  return { id, path };
}

const hammer: { name: string; category: string; where: string | null; confidence: string } = { name: "Hammare", category: "Verktyg", where: "på väggen", confidence: "high" };

describe("places", () => {
  it("keeps a room and part once, whatever the spelling, and groups nothing across boenden", async () => {
    const site = await siteOf(a);
    const first = await placeOf(a, site, "Skräpförrådet", "Översta hyllan");
    const again = await insertPlaceIn(a.db, { siteId: site, room: "  skräpförrådet ", part: "ÖVERSTA hyllan" });
    expect(again.kind).toBe("taken");
    // The same room without a part, and another part, are other places.
    await placeOf(a, site, "Skräpförrådet");
    await placeOf(a, site, "Skräpförrådet", "Golvet");
    const other = await siteOf(a, "Stugan");
    await placeOf(a, other, "Skräpförrådet", "Översta hyllan");

    const places = await loadPlacesIn(a.db, site);
    expect(places.map((place) => [place.room, place.part])).toEqual([
      ["Skräpförrådet", "Översta hyllan"],
      ["Skräpförrådet", null],
      ["Skräpförrådet", "Golvet"],
    ]);
    // The room keeps the spelling it was made with.
    expect(await insertPlaceIn(a.db, { siteId: site, room: "SKRÄPFÖRRÅDET", part: "Taket" })).toMatchObject({ kind: "saved" });
    expect((await loadPlacesIn(a.db, site)).at(-1)?.room).toBe("Skräpförrådet");
    await a.db.from("thing_place").delete().eq("site_id", site).eq("part", "Taket");
    expect(places[0]).toMatchObject({ id: first, itemCount: 0, cardTakenAt: null, cardState: "none" });
  });

  it("says a boende that is gone, and hides places from another user", async () => {
    expect((await insertPlaceIn(a.db, { siteId: randomUUID(), room: "Garaget", part: null })).kind).toBe("site_gone");
    const site = await siteOf(a);
    const place = await placeOf(a, site, "Garaget");
    expect(await loadPlaceIn(b.db, place)).toBeNull();
    expect(await loadPlacesIn(b.db, site)).toEqual([]);
    // B cannot make a place in A's boende.
    expect((await insertPlaceIn(b.db, { siteId: site, room: "Garaget", part: null })).kind).toBe("site_gone");
  });

  it("removes its places, cards and things with the boende", async () => {
    const site = await siteOf(a, "Tillfälligt");
    const place = await placeOf(a, site, "Boden");
    const card = await cardOf(a, place);
    await saveReadingIn(a.db, { photoId: card.id, things: [hammer], note: null, hidden: 0 });
    const removed = await a.db.from("pantry_site").delete().eq("id", site);
    expect(removed.error).toBeNull();
    for (const table of ["thing_place", "thing_photo", "thing_item"] as const) {
      const rows = await adminClient().from(table).select("id", { count: "exact", head: true }).eq("user_id", a.id).in(table === "thing_place" ? "id" : table === "thing_photo" ? "place_id" : "place_id", [place]);
      expect(rows.count ?? 0, table).toBe(0);
    }
  });
});

describe("the files of a deleted boende and the sweep", () => {
  const exists = async (path: string) => (await downloadCardFile(a.db, path)) !== null;

  it("gives the files of a boende's cards and its places' folders, and they can be removed after the cascade", async () => {
    const site = await siteOf(a, "Med filer");
    const place = await placeOf(a, site, "Källaren");
    const card = await cardOf(a, place);
    const stray = thingPhotoPath(a.id, place, randomUUID(), "image/png");
    await uploadCardFile(a.db, stray, png, "image/png");
    files.push(stray);
    const found = await loadSiteCardFilesIn(a.db, a.id, site);
    expect([...found].sort()).toEqual([card.path, stray].sort());
    expect((await a.db.from("pantry_site").delete().eq("id", site)).error).toBeNull();
    // The rows went with the boende; the files are still there until they are removed.
    expect(await exists(card.path)).toBe(true);
    expect(await removeCardFiles(a.db, found)).toEqual({ failed: null });
    expect(await exists(card.path)).toBe(false);
    expect(await exists(stray)).toBe(false);
    expect(await loadSiteCardFilesIn(a.db, a.id, site)).toEqual([]);
  });

  it("sweeps a file without a row, never one with a row or one that is too new, and never another user's", async () => {
    const site = await siteOf(a, "Svep");
    const place = await placeOf(a, site, "Vinden");
    const kept = await cardOf(a, place);
    const orphan = thingPhotoPath(a.id, place, randomUUID(), "image/png");
    await uploadCardFile(a.db, orphan, png, "image/png");
    files.push(orphan);
    const bSite = await siteOf(b, "B:s");
    const bPlace = await placeOf(b, bSite, "Vinden");
    const others = await cardOf(b, bPlace);
    // Too new: a save in progress has its file before its row.
    expect(await sweepCardFilesIn(a.db, a.id)).toBe(0);
    expect(await exists(orphan)).toBe(true);
    // Files left by the tests above (a deleted boende's) are orphans too, so at least this one goes.
    expect(await sweepCardFilesIn(a.db, a.id, { minAgeMs: 0, now: new Date(Date.now() + 60_000) })).toBeGreaterThanOrEqual(1);
    expect(await exists(orphan)).toBe(false);
    expect(await exists(kept.path)).toBe(true);
    expect(await downloadCardFile(b.db, others.path)).not.toBeNull();
  });
});

describe("cards", () => {
  it("stores the file privately and refuses a card for a place that is not the user's", async () => {
    const site = await siteOf(a);
    const place = await placeOf(a, site, "Källaren");
    const card = await cardOf(a, place);
    const stored = await downloadCardFile(a.db, card.path);
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(png);
    expect(await downloadCardFile(b.db, card.path)).toBeNull();

    const id = randomUUID();
    const path = thingPhotoPath(b.id, place, id, "image/png");
    await uploadCardFile(b.db, path, png, "image/png");
    files.push(path);
    // B's file is in B's own folder, but the place is A's: the row is refused.
    expect(await insertCardIn(b.db, { id, placeId: place, objectPath: path, mediaType: "image/png", width: 10, height: 10, takenAt: new Date() })).toBe("place_gone");
    await removeCardFiles(b.db, [path]);
    // And B cannot upload into A's folder.
    await expect(uploadCardFile(b.db, thingPhotoPath(a.id, place, randomUUID(), "image/png"), png, "image/png")).rejects.toBeInstanceOf(ThingsDataError);
  });

  it("marks a failed reading, keeps the card, and reopens it once", async () => {
    const site = await siteOf(a);
    const place = await placeOf(a, site, "Vinden");
    const card = await cardOf(a, place);
    await markCardFailedIn(a.db, card.id, "ai_unavailable");
    expect((await loadCardsIn(a.db, place))[0]).toMatchObject({ status: "failed", errorCode: "ai_unavailable" });
    expect((await loadPlacesIn(a.db, site))[0]).toMatchObject({ cardState: "failed", cardTakenAt: null });
    expect(await reopenCardIn(a.db, card.id)).toBe(true);
    // A second "Försök igen" finds nothing failed.
    expect(await reopenCardIn(a.db, card.id)).toBe(false);
    expect((await loadCardsIn(a.db, place))[0]).toMatchObject({ status: "reading", errorCode: null });
    // A card that is `reading` is not marked failed by a stale write after it is done.
    await saveReadingIn(a.db, { photoId: card.id, things: [], note: null, hidden: 0 });
    await markCardFailedIn(a.db, card.id, "ai_unavailable");
    expect((await loadCardsIn(a.db, place))[0]?.status).toBe("done");
  });
});

describe("save_thing_card (Story 18.11) and save_thing_reading", () => {
  it("saves the things, makes the card done and ADDS to the place: nothing is replaced without Ta om", async () => {
    const site = await siteOf(a);
    const place = await placeOf(a, site, "Skräpförrådet", "Väggen");
    const old = await cardOf(a, place, "2026-10-01T10:00:00Z");
    expect(await saveReadingIn(a.db, { photoId: old.id, things: [hammer], note: null, hidden: 0 })).toEqual([]);

    const fresh = await cardOf(a, place);
    const removed = await saveReadingIn(a.db, {
      photoId: fresh.id,
      things: [
        { name: "Cirkelsåg", category: "Verktyg", where: "översta hyllan, vänster", confidence: "high" },
        { name: "Presenning", category: "Hushåll", where: null, confidence: "low" },
      ],
      note: "Innehållet i tre lådor syns inte.",
      hidden: 3,
    });
    expect(removed).toEqual([]);
    // Both cards are there, each with its things.
    expect((await loadCardsIn(a.db, place)).map((card) => card.id).sort()).toEqual([old.id, fresh.id].sort());
    expect(await loadThingsIn(a.db, old.id)).toMatchObject([{ name: "Hammare" }]);
    expect(await loadThingsIn(a.db, fresh.id)).toMatchObject([
      { name: "Cirkelsåg", category: "Verktyg", whereHint: "översta hyllan, vänster", confidence: "high" },
      { name: "Presenning", category: "Hushåll", whereHint: null, confidence: "low" },
    ]);
    expect((await loadCardsIn(a.db, place))[0]).toMatchObject({ status: "done", unseenCount: 3, unseenNote: "Innehållet i tre lådor syns inte." });
    expect((await loadPlacesIn(a.db, site))[0]).toMatchObject({ itemCount: 3, cardState: "done" });
  });

  it("Ta om replaces only the card it names, once the new one is read, and never a card of another place", async () => {
    const site = await siteOf(a);
    const place = await placeOf(a, site, "Garaget", "Väggen");
    const other = await placeOf(a, site, "Garaget");
    const keep = await doneCard(a, place, [{ ...hammer, name: "Spade" }], "2026-10-01T10:00:00Z");
    const old = await doneCard(a, place, [hammer], "2026-10-02T10:00:00Z");
    const elsewhere = await doneCard(a, other, [{ ...hammer, name: "Såg" }], "2026-10-03T10:00:00Z");

    // The replacing card is `reading`: until it is read, the old one is still there.
    const redo = await cardOf(a, place, undefined, old.id);
    expect((await loadCardsIn(a.db, place)).map((card) => card.id).sort()).toEqual([keep.id, old.id, redo.id].sort());
    const removed = await saveReadingIn(a.db, { photoId: redo.id, things: [{ ...hammer, name: "Hammare, ny" }], note: null, hidden: 0 });
    expect(removed).toEqual([old.path]);
    expect((await loadCardsIn(a.db, place)).map((card) => card.id).sort()).toEqual([keep.id, redo.id].sort());
    expect(await loadThingsIn(a.db, old.id)).toEqual([]);
    expect(await loadThingsIn(a.db, keep.id)).toMatchObject([{ name: "Spade" }]);

    // A replaced card that is gone by then leaves the new card as an added one (the column is set null).
    const gone = await cardOf(a, place, undefined, keep.id);
    await removeCardIn(a.db, keep.id);
    expect((await a.db.from("thing_photo").select("replaces_photo_id").eq("id", gone.id).single()).data?.replaces_photo_id).toBeNull();

    // A card that names a card of another place replaces nothing.
    const cross = await cardOf(a, place, undefined, elsewhere.id);
    expect(await saveReadingIn(a.db, { photoId: cross.id, things: [hammer], note: null, hidden: 0 })).toEqual([]);
    expect(await loadThingsIn(a.db, elsewhere.id)).toMatchObject([{ name: "Såg" }]);
  });

  it("keeps save_thing_reading for the code before it: it still replaces the older cards of the place", async () => {
    const site = await siteOf(a);
    const place = await placeOf(a, site, "Boden", "Golvet");
    const old = await cardOf(a, place, "2026-10-01T10:00:00Z");
    await a.db.rpc("save_thing_reading", { photo: old.id, things: [{ name: "Hammare", category: "Verktyg", confidence: "high" }] });
    const fresh = await cardOf(a, place);
    const answer = await a.db.rpc("save_thing_reading", { photo: fresh.id, things: [{ name: "Spade", category: "Trädgård", confidence: "high" }] });
    expect(answer.error).toBeNull();
    expect(answer.data).toEqual([old.path]);
    expect((await loadCardsIn(a.db, place)).map((card) => card.id)).toEqual([fresh.id]);
  });

  it("refuses a card that is done, gone or another user's (MK440), and a thing outside the lists", async () => {
    const site = await siteOf(a);
    const place = await placeOf(a, site, "Garaget");
    const card = await cardOf(a, place);
    await expect(saveReadingIn(b.db, { photoId: card.id, things: [hammer], note: null, hidden: 0 })).rejects.toMatchObject({ detail: "card_gone" });
    await expect(saveReadingIn(a.db, { photoId: card.id, things: [{ ...hammer, category: "Mat" }], note: null, hidden: 0 })).rejects.toMatchObject({
      detail: expect.stringContaining("save_failed"),
    });
    // Nothing was written by the refused call: the card is still `reading` and has no things.
    expect((await loadCardsIn(a.db, place))[0]?.status).toBe("reading");
    expect(await loadThingsIn(a.db, card.id)).toEqual([]);
    await saveReadingIn(a.db, { photoId: card.id, things: [hammer], note: null, hidden: 0 });
    await expect(saveReadingIn(a.db, { photoId: card.id, things: [hammer], note: null, hidden: 0 })).rejects.toMatchObject({ detail: "card_gone" });
    await expect(saveReadingIn(a.db, { photoId: randomUUID(), things: [], note: null, hidden: 0 })).rejects.toMatchObject({ detail: "card_gone" });
  });

  it("is not for anon, and an ai_job of the kind things can be queued", async () => {
    const queued = await a.db.rpc("enqueue_ai_job", {
      job_kind: "things",
      job_client_key: randomUUID(),
      job_context: { placeId: randomUUID() },
      queue_deadline: new Date(Date.now() + 175_000).toISOString(),
    });
    expect(queued.error).toBeNull();
    const db: Db = (await import("./support")).anonClient();
    const refused = await db.rpc("save_thing_reading", { photo: randomUUID(), things: [] });
    expect(refused.error).not.toBeNull();
  });
});

/** A finished card with things, as the job saves it. */
async function doneCard(user: TestUser, placeId: string, things = [hammer], createdAt?: string): Promise<{ id: string; path: string }> {
  const card = await cardOf(user, placeId, createdAt);
  await saveReadingIn(user.db, { photoId: card.id, things, note: "Innehållet i en låda syns inte.", hidden: 1 });
  return card;
}

describe("Förnya och ta bort (Story 18.3)", () => {
  const exists = async (path: string) => (await downloadCardFile(c.db, path)) !== null;

  it("removes the card and its things at once but keeps the file, and Ångra puts back the same rows", async () => {
    const site = await siteOf(c);
    const place = await placeOf(c, site, "Ångra-rummet");
    const card = await doneCard(c, place, [hammer, { ...hammer, name: "Spade", category: "Trädgård", where: null, confidence: "low" }]);
    const before = await loadThingsIn(c.db, card.id);
    const [stored] = await loadCardsIn(c.db, place);

    const removed = await removeCardIn(c.db, card.id);
    expect(removed?.snapshot).toMatchObject({ id: card.id, placeId: place, objectPath: card.path, unseenCount: 1, unseenNote: "Innehållet i en låda syns inte." });
    expect(removed?.snapshot.things.map((thing) => thing.name)).toEqual(["Hammare", "Spade"]);
    expect(await loadCardsIn(c.db, place)).toEqual([]);
    expect(await loadThingsIn(c.db, card.id)).toEqual([]);
    expect(await exists(card.path)).toBe(true);

    expect(await restoreCardIn(c.db, removed!.snapshot)).toBe("restored");
    expect(await loadCardsIn(c.db, place)).toEqual([stored]);
    expect(await loadThingsIn(c.db, card.id)).toEqual(before);
    // A second Ångra changes nothing.
    expect(await restoreCardIn(c.db, removed!.snapshot)).toBe("restored");
    expect(await loadThingsIn(c.db, card.id)).toEqual(before);
  });

  it("removes the file when the undo time is out, but never the file of a card that is back", async () => {
    const site = await siteOf(c);
    const place = await placeOf(c, site, "Fil-rummet");
    const card = await doneCard(c, place);
    const removed = await removeCardIn(c.db, card.id);
    await restoreCardIn(c.db, removed!.snapshot);
    await removeCardFileIfOrphan(c.db, card.path);
    expect(await exists(card.path)).toBe(true);

    const again = await removeCardIn(c.db, card.id);
    await removeCardFileIfOrphan(c.db, card.path);
    expect(await exists(card.path)).toBe(false);
    // Too late for Ångra: the file is gone, and nothing is written.
    expect(await restoreCardIn(c.db, again!.snapshot)).toBe("file_gone");
    expect(await loadCardsIn(c.db, place)).toEqual([]);
  });

  it("gives null for a card that is gone, not finished or another user's, and says a place that is gone", async () => {
    const site = await siteOf(c);
    const place = await placeOf(c, site, "Främmande");
    const done = await doneCard(c, place);
    const reading = await cardOf(c, place);
    expect(await removeCardIn(c.db, reading.id)).toBeNull();
    expect(await removeCardIn(c.db, randomUUID())).toBeNull();
    expect(await removeCardIn(b.db, done.id)).toBeNull();
    expect(await loadCardsIn(c.db, place)).toHaveLength(2);

    const removed = await removeCardIn(c.db, done.id);
    await c.db.from("thing_place").delete().eq("id", place);
    expect(await restoreCardIn(c.db, removed!.snapshot)).toBe("place_gone");
  });

  it("renames just one thing, and removes just one thing with Ångra, leaving the card alone", async () => {
    const site = await siteOf(c);
    const place = await placeOf(c, site, "Pryl-rummet");
    const card = await doneCard(c, place, [hammer, { ...hammer, name: "Spade" }]);
    const [cardBefore] = await loadCardsIn(c.db, place);
    const [first, second] = await loadThingsIn(c.db, card.id);

    expect(await renameItemIn(c.db, first.id, "Klohammare")).toBe(true);
    expect((await loadThingsIn(c.db, card.id)).map((thing) => thing.name)).toEqual(["Klohammare", "Spade"]);
    // Another user's thing, and one that is gone, are not renamed.
    expect(await renameItemIn(b.db, first.id, "Stulen")).toBe(false);
    expect(await renameItemIn(c.db, randomUUID(), "Ingen")).toBe(false);

    const removed = await removeItemIn(c.db, second.id);
    expect(removed).toMatchObject({ id: second.id, photoId: card.id, placeId: place, name: "Spade" });
    expect((await loadThingsIn(c.db, card.id)).map((thing) => thing.name)).toEqual(["Klohammare"]);
    expect(await removeItemIn(b.db, first.id)).toBeNull();
    expect(await restoreItemIn(c.db, removed!)).toBe("restored");
    expect(await loadThingsIn(c.db, card.id)).toEqual([{ ...first, name: "Klohammare" }, second]);
    // The card, with its date, is as it was.
    expect(await loadCardsIn(c.db, place)).toEqual([cardBefore]);
    // A thing whose card is gone cannot come back.
    await removeCardIn(c.db, card.id);
    expect(await restoreItemIn(c.db, removed!)).toBe("gone");
  });
});

describe("things written into a box and the search (Stories 18.13 and 18.14)", () => {
  let g: TestUser;
  beforeAll(async () => {
    g = await createTestUser("things-g");
  });
  const box = async (user: TestUser, site: string, room: string, name: string) => {
    const saved = await insertPlaceIn(user.db, { siteId: site, room, part: name }, true);
    if (saved.kind !== "saved") throw new Error("not saved");
    return saved.id;
  };

  it("writes things into a box without a card, replaces them on a new text, and leaves the box's cards alone", async () => {
    const site = await siteOf(g, "Skrivet");
    const black = await box(g, site, "Skräpförrådet", "Black box");
    const cardThings = await doneCard(g, black, [{ ...hammer, name: "Julgransbelysning", category: "Elektronik" }]);
    expect(await replaceBoxThingsIn(g.db, black, [{ name: "Adventsljusstake, 2 st", category: "Hushåll" }, { name: "Glitter", category: "Övrigt" }])).toEqual({ kind: "saved", count: 2 });
    expect((await loadWrittenIn(g.db, black)).map((thing) => thing.name)).toEqual(["Adventsljusstake, 2 st", "Glitter"]);
    // A row without a card: source manual, no photo, a place.
    const { data } = await g.db.from("thing_item").select("photo_id, place_id, source, confidence").eq("place_id", black).eq("source", "manual");
    expect(data).toEqual([
      { photo_id: null, place_id: black, source: "manual", confidence: "high" },
      { photo_id: null, place_id: black, source: "manual", confidence: "high" },
    ]);
    // Editing the text replaces the written things; the photographed one stays.
    expect(await replaceBoxThingsIn(g.db, black, [{ name: "Tomtenissar", category: "Övrigt" }])).toEqual({ kind: "saved", count: 1 });
    expect((await loadWrittenIn(g.db, black)).map((thing) => thing.name)).toEqual(["Tomtenissar"]);
    expect((await loadThingsIn(g.db, cardThings.id)).map((thing) => thing.name)).toEqual(["Julgransbelysning"]);
    // Both kinds are in the room's counts and lists, "i Black box".
    expect((await loadRoomsIn(g.db, site))[0]).toMatchObject({ things: 2, cards: 1 });
    expect((await loadRoomThingsIn(g.db, site, "skräpförrådet", "Övrigt")).map((thing) => [thing.name, thing.whereHint])).toEqual([["Tomtenissar", "i Black box"]]);
    const written = await loadRoomWrittenIn(g.db, site, "skräpförrådet");
    expect(written.map((entry) => [entry.placeId, entry.part, entry.things])).toEqual([[black, "Black box", 1]]);
    // An empty list empties the written things.
    expect(await replaceBoxThingsIn(g.db, black, [])).toEqual({ kind: "saved", count: 0 });
    expect(await loadWrittenIn(g.db, black)).toEqual([]);
  });

  it("keeps what the code before this reads working with a thing that has no card", async () => {
    const site = await siteOf(g, "Skrivet-main");
    const black = await box(g, site, "Garaget", "Black box");
    const part = await placeOf(g, site, "Garaget", "Väggen");
    await doneCard(g, part, [hammer]);
    await replaceBoxThingsIn(g.db, black, [{ name: "Skruvdragare", category: "Verktyg" }]);
    // The reads of main: places, rooms, categories, lists, cards, merge input and the removal of a thing by id.
    expect((await loadPlacesIn(g.db, site)).map((place) => place.itemCount).sort()).toEqual([1, 1]);
    expect((await loadRoomsIn(g.db, site))[0]).toMatchObject({ things: 2, cards: 1 });
    expect(await loadRoomCategoriesIn(g.db, site, "garaget")).toEqual([{ category: "Verktyg", things: 2 }]);
    expect((await loadRoomThingsIn(g.db, site, "garaget", "Verktyg")).map((thing) => thing.name)).toEqual(["Hammare", "Skruvdragare"]);
    expect((await loadRoomCardsIn(g.db, site, "garaget")).map((card) => card.things)).toEqual([1]);
    expect(await loadPlaceIn(g.db, black)).toMatchObject({ isBox: true, itemCount: 1 });
    const { data } = await g.db.from("thing_item").select("id").eq("place_id", black).single();
    // A written thing is changed by editing the box's text, not removed alone.
    expect(await removeItemIn(g.db, data!.id)).toBeNull();
    expect((await loadWrittenIn(g.db, black)).map((thing) => thing.name)).toEqual(["Skruvdragare"]);
    // The old save still works for a card of the same place.
    expect(await doneCard(g, part, [{ ...hammer, name: "Såg" }])).toBeTruthy();
  });

  it("refuses a place that is not a box, another user's box, a thing outside the lists, a row without a card that is not written and anon", async () => {
    const site = await siteOf(g, "Skrivet-fel");
    const part = await placeOf(g, site, "Boden");
    const black = await box(g, site, "Boden", "Backen");
    expect(await replaceBoxThingsIn(g.db, part, [{ name: "Spade", category: "Trädgård" }])).toEqual({ kind: "gone" });
    expect(await replaceBoxThingsIn(b.db, black, [{ name: "Spade", category: "Trädgård" }])).toEqual({ kind: "gone" });
    await expect(replaceBoxThingsIn(g.db, black, [{ name: "Spade", category: "Mat" as never }])).rejects.toBeInstanceOf(ThingsDataError);
    await expect(replaceBoxThingsIn(g.db, black, [{ name: "", category: "Övrigt" }])).rejects.toBeInstanceOf(ThingsDataError);
    // The table: a thing with no card must be written by hand, and one with a card must not.
    const bare = { place_id: black, name: "Spade", category: "Trädgård", confidence: "high" };
    expect((await g.db.from("thing_item").insert({ ...bare, photo_id: null })).error?.code).toBe("23514");
    expect((await g.db.from("thing_item").insert({ ...bare, source: "manual", photo_id: randomUUID() })).error).not.toBeNull();
    expect((await g.db.from("thing_item").insert({ ...bare, source: "other", photo_id: null })).error?.code).toBe("23514");
    expect((await anonClient().rpc("replace_box_things", { box: black, things: [] })).error).not.toBeNull();
    expect(await loadWrittenIn(b.db, black)).toEqual([]);
  });

  it("removes the written things with their box, and with the boende", async () => {
    const site = await siteOf(g, "Skrivet-bort");
    const black = await box(g, site, "Boden", "Backen");
    await replaceBoxThingsIn(g.db, black, [{ name: "Spade", category: "Trädgård" }]);
    await g.db.from("thing_place").delete().eq("id", black);
    expect((await g.db.from("thing_item").select("id").eq("place_id", black)).data).toEqual([]);
  });

  it("finds things by a name that holds a term or is close to it (a typo, an ending), best first, from cards and written things alike", async () => {
    const site = await siteOf(g, "Sök-db");
    const wall = await placeOf(g, site, "Skräpförrådet", "Väggen");
    const black = await box(g, site, "Skräpförrådet", "Black box");
    await doneCard(g, wall, [
      { ...hammer, name: "Skiftnyckel 22 mm" },
      { ...hammer, name: "Hammare" },
      { ...hammer, name: "Lövblås", category: "Trädgård" },
    ]);
    await replaceBoxThingsIn(g.db, black, [
      { name: "Skiftnycklar", category: "Verktyg" },
      { name: "Julgransbelysning", category: "Elektronik" },
    ]);
    const names = async (...terms: string[]) => (await searchThingsIn(g.db, terms)).filter((hit) => hit.siteId === site).map((hit) => hit.name);
    // The ending, a typo and a part of a word.
    expect(await names("skiftnyckel")).toEqual(["Skiftnyckel 22 mm", "Skiftnycklar"]);
    const typo = await names("skiftnykel");
    expect(typo).toEqual(expect.arrayContaining(["Skiftnyckel 22 mm", "Skiftnycklar"]));
    expect(await names("hammar")).toEqual(["Hammare"]);
    expect(await names("hamare")).toEqual(["Hammare"]);
    expect(await names("blås")).toEqual(["Lövblås"]);
    // Any of the terms; a category holds a term too; unknown words find nothing.
    expect((await names("hammare", "julgran")).sort()).toEqual(["Hammare", "Julgransbelysning"]);
    expect(await names("elektronik")).toEqual(["Julgransbelysning"]);
    expect(await names("cykelpump")).toEqual([]);
    expect(await names("", " ", "x")).toEqual([]);
    expect(await searchThingsIn(g.db, [])).toEqual([]);

    const hits = (await searchThingsIn(g.db, ["julgransbelysning", "skiftnyckel"])).filter((hit) => hit.siteId === site);
    const written = hits.find((hit) => hit.name === "Julgransbelysning");
    expect(written).toMatchObject({ written: true, photoId: null, isBox: true, part: "Black box", room: "Skräpförrådet", siteName: "Sök-db", score: 1 });
    const photographed = hits.find((hit) => hit.name === "Skiftnyckel 22 mm");
    expect(photographed).toMatchObject({ written: false, isBox: false, part: "Väggen", whereHint: "på väggen" });
    expect(photographed?.photoId).not.toBeNull();
    // The limit.
    expect(await searchThingsIn(g.db, ["nyckel", "hammare", "blås"], 2)).toHaveLength(2);
  });

  it("counts a merged thing once, finds nothing of another user's, and is not for anon", async () => {
    const site = await siteOf(g, "Sök-db-privat");
    const whole = await placeOf(g, site, "Boden");
    const first = await doneCard(g, whole, [{ ...hammer, name: "Kratta", category: "Trädgård" }], "2026-10-01T10:00:00Z");
    const second = await doneCard(g, whole, [{ ...hammer, name: "Kratta med skaft", category: "Trädgård" }], "2026-10-02T10:00:00Z");
    const item = async (card: string, name: string) => (await g.db.from("thing_item").select("id").eq("photo_id", card).eq("name", name).single()).data!.id;
    await mergeItemsIn(g.db, second.id, [{ item: await item(second.id, "Kratta med skaft"), target: await item(first.id, "Kratta") }]);
    const hits = await searchThingsIn(g.db, ["kratta"]);
    expect(hits.map((hit) => [hit.name, hit.seenOn])).toEqual([["Kratta", 2]]);
    expect(await searchThingsIn(b.db, ["kratta"])).toEqual([]);
    expect((await anonClient().rpc("search_things", { terms: ["kratta"] })).error).not.toBeNull();
  });

  it("counts the closed containers per room, less boxes that have contents, plus boxes that are empty", async () => {
    const h = await createTestUser("things-h");
    const site = await siteOf(h, "Lådor");
    const whole = await placeOf(h, site, "Skräpförrådet");
    // Two closed containers on the card (doneCard says one; this card says three).
    const card = await cardOf(h, whole);
    await saveReadingIn(h.db, { photoId: card.id, things: [hammer], note: null, hidden: 3 });
    const withText = await box(h, site, "Skräpförrådet", "Skriven");
    const empty = await box(h, site, "Skräpförrådet", "Tom");
    await replaceBoxThingsIn(h.db, withText, [{ name: "Glitter", category: "Övrigt" }]);
    // 3 closed - 1 box with contents + 1 empty box = 3.
    expect(await loadUnseenIn(h.db)).toEqual([{ siteId: site, room: "Skräpförrådet", roomKey: "skräpförrådet", count: 3 }]);
    expect(empty).toBeTruthy();
    expect(await loadUnseenIn(b.db)).toEqual([]);
  });
});

describe("overlap merge (Story 18.6)", () => {
  const saw = { ...hammer, name: "Cirkelsåg", where: "på väggen" };
  const spade = { ...hammer, name: "Spade", where: null };
  // Own users: a user has at most 10 boenden, and the earlier tests have used theirs.
  let d: TestUser;
  let e: TestUser;
  beforeAll(async () => {
    d = await createTestUser("things-d");
    e = await createTestUser("things-e");
  });

  /** The id of the thing named `name` on the card. */
  async function itemId(user: TestUser, cardId: string, name: string): Promise<string> {
    const { data } = await user.db.from("thing_item").select("id").eq("photo_id", cardId).eq("name", name).single();
    return data!.id;
  }

  it("makes boxes of kind box, also for the code before it that only writes the key, and backfilled ones", async () => {
    const site = await siteOf(d, "Kind");
    const placeId = await placeOf(d, site, "Källaren");
    const box = await insertPlaceIn(d.db, { siteId: site, room: "Källaren", part: "Blå backen" }, true);
    if (box.kind !== "saved") throw new Error("not saved");
    const legacy = await d.db.from("thing_place").insert({ site_id: site, room: "Källaren", part: "Röda", room_key: "källaren", part_key: "box:röda" }).select("id, kind").single();
    expect(legacy.data?.kind).toBe("box");
    const kinds = await d.db.from("thing_place").select("id, kind").in("id", [placeId, box.id]);
    expect(Object.fromEntries(kinds.data!.map((row) => [row.id, row.kind]))).toEqual({ [placeId]: "part", [box.id]: "box" });
    expect((await loadPlaceIn(d.db, box.id))?.isBox).toBe(true);
    // A box that is not a box by its key, or the other way round, is refused.
    const bad = await d.db.from("thing_place").insert({ site_id: site, room: "Källaren", part: "Fel", room_key: "källaren", part_key: "fel", kind: "box" });
    expect(bad.error?.code).toBe("23514");
  });

  it("merges the same thing of two cards in one room, counts it once, and shows it on both cards", async () => {
    const site = await siteOf(d, "Merge");
    const left = await placeOf(d, site, "Förrådet", "Vänster vägg");
    const whole = await placeOf(d, site, "Förrådet");
    const first = await doneCard(d, left, [saw, spade], "2026-03-01T10:00:00Z");
    const second = await doneCard(d, whole, [{ ...saw, name: "Batteridriven cirkelsåg" }, hammer], "2026-03-02T10:00:00Z");
    const request = await loadMergeInputIn(d.db, second.id);
    expect(request?.room).toBe("Förrådet");
    expect(request?.cardTitle).toBe("Hela rummet");
    expect(request?.existing.map((thing) => [thing.name, thing.card])).toEqual([["Cirkelsåg", expect.stringMatching(/^Vänster vägg \d+ \w+$/)], ["Spade", expect.stringMatching(/^Vänster vägg \d+ \w+$/)]]);
    expect(request?.added.map((thing) => thing.name)).toEqual(["Batteridriven cirkelsåg", "Hammare"]);

    const merged = await mergeItemsIn(d.db, second.id, [{ item: await itemId(d, second.id, "Batteridriven cirkelsåg"), target: await itemId(d, first.id, "Cirkelsåg") }]);
    expect(merged).toBe(1);

    // Both cards still list what is on them, and say the saw is on two.
    expect((await loadThingsIn(d.db, first.id)).map((thing) => [thing.name, thing.seenOn])).toEqual([["Cirkelsåg", 2], ["Spade", 1]]);
    expect((await loadThingsIn(d.db, second.id)).map((thing) => [thing.name, thing.seenOn])).toEqual([["Batteridriven cirkelsåg", 2], ["Hammare", 1]]);
    // The room's things are counted once: three, not four.
    const places = await loadPlacesIn(d.db, site);
    expect(places.filter((place) => [left, whole].includes(place.id)).map((place) => place.itemCount)).toEqual([2, 1]);
    // The search finds the saw once, on its kept card, with two cards.
    const found = (await searchThingsIn(d.db, ["såg", "spade", "hammare"])).filter((hit) => [left, whole].includes(hit.placeId));
    expect(found.map((hit) => [hit.name, hit.seenOn]).sort()).toEqual([["Cirkelsåg", 2], ["Hammare", 1], ["Spade", 1]]);

    // Removing the card of the merged thing keeps the kept one; removing the kept one's card keeps the merged one.
    const removedSecond = await removeCardIn(d.db, second.id);
    expect(removedSecond).not.toBeNull();
    expect((await loadThingsIn(d.db, first.id)).map((thing) => thing.seenOn)).toEqual([1, 1]);
    await restoreCardIn(d.db, removedSecond!.snapshot);
    // "Ångra" brought the merge back with the card.
    expect((await loadThingsIn(d.db, first.id)).map((thing) => thing.seenOn)).toEqual([2, 1]);
    await removeCardIn(d.db, first.id);
    expect((await loadThingsIn(d.db, second.id)).map((thing) => [thing.name, thing.seenOn])).toEqual([["Batteridriven cirkelsåg", 1], ["Hammare", 1]]);
    const after = (await searchThingsIn(d.db, ["cirkelsåg", "hammare"])).filter((hit) => hit.placeId === whole);
    expect(after.map((hit) => hit.name).sort()).toEqual(["Batteridriven cirkelsåg", "Hammare"]);
  });

  it("never merges across rooms, into a box, between boenden, for another user's things, or into a chain", async () => {
    const home = await siteOf(d, "Merge-rum");
    const other = await siteOf(d, "Merge-annat");
    const room = await placeOf(d, home, "Verkstaden", "Bänken");
    const otherRoom = await placeOf(d, home, "Garaget");
    const cabin = await placeOf(d, other, "Verkstaden", "Bänken");
    const box = await insertPlaceIn(d.db, { siteId: home, room: "Verkstaden", part: "Lådan" }, true);
    if (box.kind !== "saved") throw new Error("not saved");
    const roomCard = await doneCard(d, room, [saw]);
    const garageCard = await doneCard(d, otherRoom, [saw]);
    const cabinCard = await doneCard(d, cabin, [saw]);
    const boxCard = await doneCard(d, box.id, [saw]);
    const keep = await itemId(d, roomCard.id, "Cirkelsåg");
    for (const card of [garageCard, cabinCard, boxCard]) {
      expect(await mergeItemsIn(d.db, card.id, [{ item: await itemId(d, card.id, "Cirkelsåg"), target: keep }]), card.id).toBe(0);
    }
    // The box's card is not compared with the room, and the room's card is not compared with the box.
    expect(await loadMergeInputIn(d.db, boxCard.id)).toBeNull();
    expect((await loadMergeInputIn(d.db, roomCard.id))?.existing).toEqual([]);

    // Another user cannot point at a thing that is not theirs.
    const bSite = await siteOf(e, "Merge-b");
    const bCard = await doneCard(e, await placeOf(e, bSite, "Verkstaden", "Bänken"), [saw]);
    expect(await mergeItemsIn(e.db, bCard.id, [{ item: await itemId(e, bCard.id, "Cirkelsåg"), target: keep }])).toBe(0);

    // No chains and no cycles: a thing that is pointed at is not merged into another, and a merged one is not a target.
    const sibling = await placeOf(d, home, "Verkstaden", "Golvet");
    const third = await placeOf(d, home, "Verkstaden", "Hyllan");
    const siblingCard = await doneCard(d, sibling, [saw]);
    const thirdCard = await doneCard(d, third, [saw]);
    const mine = await itemId(d, siblingCard.id, "Cirkelsåg");
    expect(await mergeItemsIn(d.db, siblingCard.id, [{ item: mine, target: keep }])).toBe(1);
    expect(await mergeItemsIn(d.db, roomCard.id, [{ item: keep, target: mine }])).toBe(0);
    expect(await mergeItemsIn(d.db, thirdCard.id, [{ item: await itemId(d, thirdCard.id, "Cirkelsåg"), target: mine }])).toBe(0);
    expect(await mergeItemsIn(d.db, thirdCard.id, [{ item: await itemId(d, thirdCard.id, "Cirkelsåg"), target: keep }])).toBe(1);
    expect((await loadThingsIn(d.db, roomCard.id))[0].seenOn).toBe(3);
  });

  it("Ångra puts the merges back and never brings duplicates back", async () => {
    const site = await siteOf(d, "Ångra-merge");
    const left = await placeOf(d, site, "Garaget", "Vänster");
    const right = await placeOf(d, site, "Garaget", "Höger");
    const first = await doneCard(d, left, [saw, spade], "2026-04-01T10:00:00Z");
    const second = await doneCard(d, right, [{ ...saw, name: "Cirkelsåg 2" }, hammer], "2026-04-02T10:00:00Z");
    const kept = await itemId(d, first.id, "Cirkelsåg");
    const merged = await itemId(d, second.id, "Cirkelsåg 2");
    expect(await mergeItemsIn(d.db, second.id, [{ item: merged, target: kept }])).toBe(1);

    // Remove the card with the kept thing: the other card's thing becomes kept; "Ångra" makes it a duplicate again, not a second kept thing.
    const removed = await removeCardIn(d.db, first.id);
    expect(removed!.snapshot.things.find((thing) => thing.id === kept)?.pointedBy).toEqual([merged]);
    expect((await loadThingsIn(d.db, second.id)).map((thing) => thing.seenOn)).toEqual([1, 1]);
    await restoreCardIn(d.db, removed!.snapshot);
    expect((await loadThingsIn(d.db, second.id)).map((thing) => [thing.name, thing.seenOn])).toEqual([["Cirkelsåg 2", 2], ["Hammare", 1]]);
    const found = (await searchThingsIn(d.db, ["såg", "spade", "hammare"])).filter((hit) => [left, right].includes(hit.placeId));
    expect(found.map((hit) => hit.name).sort()).toEqual(["Cirkelsåg", "Hammare", "Spade"]);

    // Remove the card with the merged thing and put it back: its own link is back too.
    const removedSecond = await removeCardIn(d.db, second.id);
    expect(removedSecond!.snapshot.things.find((thing) => thing.id === merged)?.sameAs).toBe(kept);
    await restoreCardIn(d.db, removedSecond!.snapshot);
    expect((await loadThingsIn(d.db, first.id)).map((thing) => [thing.name, thing.seenOn])).toEqual([["Cirkelsåg", 2], ["Spade", 1]]);

    // One thing removed and brought back, both ways.
    const single = await removeItemIn(d.db, kept);
    expect(single?.pointedBy).toEqual([merged]);
    expect(await restoreItemIn(d.db, single!)).toBe("restored");
    expect((await loadThingsIn(d.db, second.id)).map((thing) => thing.seenOn)).toEqual([2, 1]);
    const dup = await removeItemIn(d.db, merged);
    expect(dup?.sameAs).toBe(kept);
    expect((await loadThingsIn(d.db, first.id)).map((thing) => thing.seenOn)).toEqual([1, 1]);
    await restoreItemIn(d.db, dup!);
    expect((await loadThingsIn(d.db, first.id)).map((thing) => thing.seenOn)).toEqual([2, 1]);

    // A link that no longer holds is left alone: the target went (its card was removed for good), or the thing was merged elsewhere meanwhile.
    const gone = await removeItemIn(d.db, merged);
    await removeCardIn(d.db, first.id);
    expect(await restoreItemIn(d.db, gone!)).toBe("restored");
    expect((await loadThingsIn(d.db, second.id)).map((thing) => thing.seenOn)).toEqual([1, 1]);
  });

  it("says when every thing of a card is on other cards, and leaves such a place out of the search", async () => {
    const site = await siteOf(e, "Alla-merge");
    const one = await placeOf(e, site, "Boden", "A");
    const two = await placeOf(e, site, "Boden", "B");
    const first = await doneCard(e, one, [saw], "2026-05-01T10:00:00Z");
    const second = await doneCard(e, two, [{ ...saw, name: "Sågen" }], "2026-05-02T10:00:00Z");
    await mergeItemsIn(e.db, second.id, [{ item: await itemId(e, second.id, "Sågen"), target: await itemId(e, first.id, "Cirkelsåg") }]);
    const places = await loadPlacesIn(e.db, site);
    expect(places.map((place) => [place.itemCount, place.mergedAway])).toEqual([[1, 0], [0, 1]]);
    expect((await searchThingsIn(e.db, ["sågen", "cirkelsåg"])).filter((hit) => [one, two].includes(hit.placeId)).map((hit) => hit.placeId)).toEqual([one]);
  });
});


describe("rooms (Stories 18.11 and 18.12)", () => {
  let f: TestUser;
  beforeAll(async () => {
    f = await createTestUser("things-f");
  });

  it("counts a room's things, cards and newest date in the database, across its parts, whole room and boxes", async () => {
    const site = await siteOf(f, "Rum");
    const whole = await placeOf(f, site, "Skräpförrådet");
    const wall = await placeOf(f, site, "Skräpförrådet", "Väggen");
    const box = await insertPlaceIn(f.db, { siteId: site, room: "Skräpförrådet", part: "Black box" }, true);
    if (box.kind !== "saved") throw new Error("not saved");
    const garage = await placeOf(f, site, "Garaget");
    await doneCard(f, whole, [hammer, { ...hammer, name: "Spade", category: "Trädgård" }], "2026-10-01T10:00:00Z");
    // Many cards on one place: a new card adds.
    await doneCard(f, whole, [{ ...hammer, name: "Såg" }], "2026-10-02T10:00:00Z");
    await doneCard(f, wall, [{ ...hammer, name: "Skiftnyckel" }], "2026-10-03T10:00:00Z");
    await doneCard(f, box.id, [{ ...hammer, name: "Julgransbelysning", category: "Elektronik" }], "2026-10-04T10:00:00Z");
    await cardOf(f, garage);

    const rooms = await loadRoomsIn(f.db, site);
    expect(rooms.map((room) => [room.room, room.key, room.things, room.cards, room.reading])).toEqual([
      ["Skräpförrådet", "skräpförrådet", 5, 4, 0],
      ["Garaget", "garaget", 0, 0, 1],
    ]);
    expect(rooms[0].latest).not.toBeNull();
    expect((await loadRoomIn(f.db, site, "garaget"))?.reading).toBe(1);
    expect(await loadRoomIn(f.db, site, "finns-inte")).toBeNull();

    expect(await loadRoomCategoriesIn(f.db, site, "skräpförrådet")).toEqual([
      { category: "Verktyg", things: 3 },
      { category: "Trädgård", things: 1 },
      { category: "Elektronik", things: 1 },
    ]);
    const tools = await loadRoomThingsIn(f.db, site, "skräpförrådet", "Verktyg");
    expect(tools.map((thing) => thing.name)).toEqual(["Hammare", "Skiftnyckel", "Såg"].sort((x, y) => x.localeCompare(y, "sv")));
    const electronics = await loadRoomThingsIn(f.db, site, "skräpförrådet", "Elektronik");
    expect(electronics.map((thing) => [thing.name, thing.whereHint])).toEqual([["Julgransbelysning", "i Black box"]]);

    const cards = await loadRoomCardsIn(f.db, site, "skräpförrådet");
    expect(cards.map((card) => [card.part, card.kind, card.things])).toEqual([
      ["Black box", "box", 1],
      ["Väggen", "part", 1],
      [null, "part", 1],
      [null, "part", 2],
    ]);
    expect((await loadRoomPlacesIn(f.db, site, "skräpförrådet")).map((place) => place.kind)).toEqual(["part", "part", "box"]);
    expect(await findPlaceIn(f.db, { siteId: site, roomKey: "skräpförrådet", partKey: "" })).toBe(whole);
    expect(await findPlaceIn(f.db, { siteId: site, roomKey: "skräpförrådet", partKey: "box:black box" })).toBe(box.id);
    expect(await findPlaceIn(f.db, { siteId: site, roomKey: "garaget", partKey: "väggen" })).toBeNull();
  });

  it("counts a merged thing once and says it is seen on two cards, also for two cards of one place", async () => {
    const site = await siteOf(f, "Rum-merge");
    const whole = await placeOf(f, site, "Boden");
    const first = await doneCard(f, whole, [hammer, { ...hammer, name: "Spade", where: null }], "2026-10-01T10:00:00Z");
    const second = await doneCard(f, whole, [{ ...hammer, name: "Hammare med orange skaft" }], "2026-10-02T10:00:00Z");
    // The new card is compared with the other card of the same place.
    const request = await loadMergeInputIn(f.db, second.id);
    expect(request?.existing.map((thing) => thing.name)).toEqual(["Hammare", "Spade"]);
    const item = async (card: string, name: string) => (await f.db.from("thing_item").select("id").eq("photo_id", card).eq("name", name).single()).data!.id;
    expect(await mergeItemsIn(f.db, second.id, [{ item: await item(second.id, "Hammare med orange skaft"), target: await item(first.id, "Hammare") }])).toBe(1);

    expect((await loadRoomsIn(f.db, site))[0]).toMatchObject({ things: 2, cards: 2 });
    const tools = await loadRoomThingsIn(f.db, site, "boden", "Verktyg");
    expect(tools.map((thing) => [thing.name, thing.whereHint])).toEqual([["Hammare", "syns på 2 kort"], ["Spade", null]]);
    // The card that was merged away still counts nothing for the room, but lists its thing.
    expect((await loadRoomCardsIn(f.db, site, "boden")).map((card) => card.things).sort()).toEqual([0, 2]);
  });

  it("shows another user nothing of a room", async () => {
    const site = await siteOf(f, "Rum-privat");
    await placeOf(f, site, "Garaget");
    expect(await loadRoomsIn(b.db, site)).toEqual([]);
    expect(await loadRoomCardsIn(b.db, site, "garaget")).toEqual([]);
    expect(await loadRoomThingsIn(b.db, site, "garaget", "Verktyg")).toEqual([]);
    const anon = (await import("./support")).anonClient();
    expect((await anon.rpc("thing_room_stats", { site })).error).not.toBeNull();
  });
});

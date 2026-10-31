import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ThingsDataError } from "@/features/things/data/client";
import { loadThingIndexIn } from "@/features/things/data/index";
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
import { insertPlaceIn, loadPlaceIn, loadPlacesIn } from "@/features/things/data/places";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

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
async function cardOf(user: TestUser, placeId: string, createdAt?: string): Promise<{ id: string; path: string }> {
  const id = randomUUID();
  const path = thingPhotoPath(user.id, placeId, id, "image/png");
  await uploadCardFile(user.db, path, png, "image/png");
  files.push(path);
  const outcome = await insertCardIn(user.db, { id, placeId, objectPath: path, mediaType: "image/png", width: 10, height: 10, takenAt: new Date() });
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

describe("save_thing_reading", () => {
  it("saves the things, makes the card done and replaces the older card of the place", async () => {
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
    expect(removed).toEqual([old.path]);
    // The old card, and its things, are gone; the file is the caller's to remove.
    expect((await loadCardsIn(a.db, place)).map((card) => card.id)).toEqual([fresh.id]);
    expect(await loadThingsIn(a.db, old.id)).toEqual([]);
    expect(await loadThingsIn(a.db, fresh.id)).toMatchObject([
      { name: "Cirkelsåg", category: "Verktyg", whereHint: "översta hyllan, vänster", confidence: "high" },
      { name: "Presenning", category: "Hushåll", whereHint: null, confidence: "low" },
    ]);
    expect((await loadCardsIn(a.db, place))[0]).toMatchObject({ status: "done", unseenCount: 3, unseenNote: "Innehållet i tre lådor syns inte." });
    expect((await loadPlacesIn(a.db, site))[0]).toMatchObject({ itemCount: 2, cardState: "done" });
    expect((await removeCardFiles(a.db, removed)).failed).toBeNull();
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

describe("the index for search and questions (Story 18.4)", () => {
  it("has the things of each place's newest finished card across boenden, with boende, date and closed containers, and nothing of another user's", async () => {
    const home = await siteOf(c, "Hemma-index");
    const cabin = await siteOf(c, "Stugan-index");
    const shed = await placeOf(c, home, "Skräpförrådet", "Översta hyllan");
    const garage = await placeOf(c, cabin, "Garaget");
    await placeOf(c, home, "Tomt");
    const old = await doneCard(c, shed, [{ ...hammer, name: "Gammal pryl" }], "2026-01-01T10:00:00Z");
    const fresh = await doneCard(c, shed, [hammer, { ...hammer, name: "Spade", where: null }], "2026-02-01T10:00:00Z");
    await doneCard(c, garage, [{ ...hammer, name: "Såg" }]);
    // A card being read has no things yet and is not in the index.
    await cardOf(c, garage, "2026-12-01T10:00:00Z");
    // restoreCardIn of an older card must not hide the newer one: the newest finished card wins.
    expect(old.id).not.toBe(fresh.id);

    const index = (await loadThingIndexIn(c.db)).filter((place) => [shed, garage].includes(place.id));
    expect(index.map((place) => [place.room, place.part, place.siteName, place.hidden])).toEqual([
      ["Skräpförrådet", "Översta hyllan", "Hemma-index", 1],
      ["Garaget", null, "Stugan-index", 1],
    ]);
    expect(index[0].things.map((thing) => [thing.name, thing.whereHint])).toEqual([
      ["Hammare", "på väggen"],
      ["Spade", null],
    ]);
    expect(index[1].things.map((thing) => thing.name)).toEqual(["Såg"]);
    expect((await loadThingIndexIn(b.db)).some((place) => [shed, garage].includes(place.id))).toBe(false);
  });
});

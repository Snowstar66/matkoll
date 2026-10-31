import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { insertAiUsageIn } from "@/features/settings/data/ai-usage";
import { loadCardViewIn, loadThingForLookupIn, saveThingBoxIn } from "@/features/things/data/card-view";
import { removeItemIn, renameItemIn, restoreItemIn, updateItemIn } from "@/features/things/data/items";
import { insertPlaceIn } from "@/features/things/data/places";
import { insertCardIn, removeCardIn, restoreCardIn, saveReadingIn, uploadCardFile } from "@/features/things/data/photos";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import { ok } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";
import { createMockAiService } from "@/server/ai/adapters/mock";
import { withUsageSink } from "@/server/ai/usage";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type Db, type TestUser } from "./support";

// Visa föremålet på kortet (Story 18.7, AD-4, AD-5) against local Supabase:
// save_thing_card saves each thing's box and leaves out one that is not inside
// the photo (the card is read either way), thing_item_box_check refuses a bad
// box, a lookup's box or miss is saved once, "Ångra" brings the box back, and
// another household reaches none of it. The lookup itself runs as the Server
// Action does, with the session client and the mock AI (never a paid model),
// and its call is counted in ai_usage (Story 17.6). Only a drawn photo.

let sessionDb: Db | undefined;
let sessionUser: { id: string; email: string } | undefined;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!sessionDb) throw new Error("No session client");
    return sessionDb;
  },
}));
vi.mock("@/features/auth/server", () => ({
  requireUser: async () => (sessionUser ? ok(sessionUser) : { ok: false, error: { code: "unauthorized", message: "" } }),
}));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
// The AI of the test is always the mock, counted like getAiServiceForUser counts a real one.
const mockAi = createMockAiService();
const located = vi.fn();
vi.mock("@/features/settings/server", () => ({
  getAiServiceForUser: async () => ({
    ...mockAi,
    locateThing: (...args: Parameters<typeof mockAi.locateThing>) => {
      located(args[0].name);
      const db = sessionDb;
      return withUsageSink((usage) => (db ? insertAiUsageIn(db, usage) : undefined), () => mockAi.locateThing(...args));
    },
  }),
}));
const { locateThingOnCard } = await import("@/features/things/actions/locate-thing");

const photo = new Uint8Array(readFileSync(new URL("../fixtures/ai/forrad.png", import.meta.url)));
const files: string[] = [];

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("boxes-a");
  b = await createTestUser("boxes-b");
});

afterAll(async () => {
  await adminClient().storage.from(thingPhotoBucket).remove(files);
  await deleteTestUsers();
});

const as = (user: TestUser) => {
  sessionDb = user.db;
  sessionUser = { id: user.id, email: user.email };
};

/** A place in a new boende of the user's, and a card of it with the drawn photo, `reading`. */
const sites = new Map<string, string>();
async function siteOf(user: TestUser): Promise<string> {
  const known = sites.get(user.id);
  if (known) return known;
  // A user with boenden has exactly one selected.
  const site = await user.db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true }).select("id").single();
  if (site.error) throw site.error;
  sites.set(user.id, site.data.id);
  return site.data.id;
}

async function readingCard(user: TestUser): Promise<{ placeId: string; cardId: string }> {
  const place = await insertPlaceIn(user.db, { siteId: await siteOf(user), room: "Boden", part: `Hylla ${randomUUID().slice(0, 8)}` });
  if (place.kind !== "saved") throw new Error(place.kind);
  const cardId = randomUUID();
  const path = thingPhotoPath(user.id, place.id, cardId, "image/png");
  await uploadCardFile(user.db, path, photo, "image/png");
  files.push(path);
  expect(await insertCardIn(user.db, { id: cardId, placeId: place.id, objectPath: path, mediaType: "image/png", width: 1200, height: 900, takenAt: new Date() })).toBe("saved");
  return { placeId: place.id, cardId };
}

const hammerBox = { left: 0.197, top: 0.153, width: 0.14, height: 0.211 };
const thing = (name: string, box?: unknown) => ({ name, category: "Verktyg", where_hint: null, confidence: "high", ...(box === undefined ? {} : { box }) });

describe("boxes on a card (Story 18.7)", () => {
  it("saves each thing's box with the reading, in the card's order, and the big view reads them", async () => {
    const { cardId } = await readingCard(a);
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [
        { name: "Hammare", category: "Verktyg", where: "på väggen, mitten", confidence: "high", box: hammerBox },
        { name: "Spade", category: "Trädgård", where: null, confidence: "high", box: null },
        { name: "Kratta", category: "Trädgård", where: null, confidence: "high" },
      ],
      note: null,
      hidden: 0,
    });
    const view = await loadCardViewIn(a.db, cardId);
    expect(view).toMatchObject({ id: cardId, room: "Boden", kind: "part", status: "done", width: 1200, height: 900 });
    expect(view?.things.map((entry) => [entry.name, entry.box, entry.boxMissed])).toEqual([
      ["Hammare", hammerBox, false],
      ["Spade", null, false],
      ["Kratta", null, false],
    ]);
  });

  it("leaves out a box that is not inside the photo or not four numbers, and still reads the card", async () => {
    const { cardId } = await readingCard(a);
    const { error } = await a.db.rpc("save_thing_card", {
      photo: cardId,
      things: [
        thing("Utanför", { left: 0.9, top: 0.1, width: 0.3, height: 0.2 }),
        thing("Ingen storlek", { left: 0.1, top: 0.1, width: 0, height: 0.2 }),
        thing("Text", { left: "0.1", top: 0.1, width: 0.2, height: 0.2 }),
        thing("Saknas", { left: 0.1, top: 0.1, width: 0.2 }),
        thing("Lista", [0.1, 0.1, 0.2, 0.2]),
        thing("Enorm", { left: 1e39, top: 1e-50, width: 0.2, height: 0.2 }),
        thing("Bra", { left: 0.5, top: 0.5, width: 0.5, height: 0.5 }),
      ] as Json,
    });
    expect(error).toBeNull();
    const view = await loadCardViewIn(a.db, cardId);
    expect(view?.status).toBe("done");
    expect(view?.things.map((entry) => [entry.name, entry.box])).toEqual([
      ["Utanför", null],
      ["Ingen storlek", null],
      ["Text", null],
      ["Saknas", null],
      ["Lista", null],
      ["Enorm", null],
      ["Bra", { left: 0.5, top: 0.5, width: 0.5, height: 0.5 }],
    ]);
  });

  it("refuses a box outside the photo, half a box, or a box and a miss together (thing_item_box_check)", async () => {
    const { cardId } = await readingCard(a);
    await saveReadingIn(a.db, { photoId: cardId, things: [{ name: "Tång", category: "Verktyg", where: null, confidence: "high" }], note: null, hidden: 0 });
    const [item] = (await loadCardViewIn(a.db, cardId))?.things ?? [];
    for (const values of [
      { box_left: 0.8, box_top: 0.1, box_width: 0.3, box_height: 0.1 },
      { box_left: -0.1, box_top: 0.1, box_width: 0.3, box_height: 0.1 },
      { box_left: 0.1, box_top: 0.1, box_width: 0.3 },
      { box_left: 0.1, box_top: 0.1, box_width: 0.3, box_height: 0.1, box_missed: true },
    ]) {
      const { error } = await a.db.from("thing_item").update(values).eq("id", item.id);
      expect(error?.code, JSON.stringify(values)).toBe("23514");
    }
  });

  it("saves a lookup's box or miss once, and keeps what another tab saved first", async () => {
    const { cardId } = await readingCard(a);
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [
        { name: "Hammare", category: "Verktyg", where: null, confidence: "high" },
        { name: "Tång", category: "Verktyg", where: null, confidence: "high" },
      ],
      note: null,
      hidden: 0,
    });
    const [hammer, pliers] = (await loadCardViewIn(a.db, cardId))?.things ?? [];
    expect(await saveThingBoxIn(a.db, hammer.id, hammerBox)).toBe(true);
    expect(await saveThingBoxIn(a.db, hammer.id, { left: 0, top: 0, width: 0.5, height: 0.5 })).toBe(false);
    expect(await saveThingBoxIn(a.db, hammer.id, null)).toBe(false);
    expect(await saveThingBoxIn(a.db, pliers.id, null)).toBe(true);
    expect(await saveThingBoxIn(a.db, pliers.id, hammerBox)).toBe(false);
    expect(await loadThingForLookupIn(a.db, hammer.id)).toMatchObject({ box: hammerBox, boxMissed: false });
    expect(await loadThingForLookupIn(a.db, pliers.id)).toMatchObject({ box: null, boxMissed: true });
    // A föremål renamed or corrected may be found under its new name: the miss goes, the box stays.
    expect(await renameItemIn(a.db, pliers.id, "Polygrip")).toBe(true);
    expect(await loadThingForLookupIn(a.db, pliers.id)).toMatchObject({ boxMissed: false });
    await saveThingBoxIn(a.db, pliers.id, null);
    expect(await updateItemIn(a.db, pliers.id, { name: "Polygrip", category: "Verktyg", whereHint: "golvet" })).toBe(true);
    expect(await loadThingForLookupIn(a.db, pliers.id)).toMatchObject({ boxMissed: false });
    expect(await renameItemIn(a.db, hammer.id, "Snickarhammare")).toBe(true);
    expect(await loadThingForLookupIn(a.db, hammer.id)).toMatchObject({ box: hammerBox });
  });

  it("brings the box back with Ångra, for a föremål and for a whole card", async () => {
    const { cardId } = await readingCard(a);
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [
        { name: "Hammare", category: "Verktyg", where: null, confidence: "high", box: hammerBox },
        { name: "Tång", category: "Verktyg", where: null, confidence: "high" },
      ],
      note: null,
      hidden: 0,
    });
    const [hammer, pliers] = (await loadCardViewIn(a.db, cardId))?.things ?? [];
    await saveThingBoxIn(a.db, pliers.id, null);

    const removed = await removeItemIn(a.db, hammer.id);
    expect(removed).toMatchObject({ box: hammerBox, boxMissed: false });
    expect(await restoreItemIn(a.db, removed!)).toBe("restored");
    expect(await loadThingForLookupIn(a.db, hammer.id)).toMatchObject({ box: hammerBox });

    const card = await removeCardIn(a.db, cardId);
    expect(card).not.toBeNull();
    expect(await restoreCardIn(a.db, card!.snapshot)).toBe("restored");
    expect((await loadCardViewIn(a.db, cardId))?.things.map((entry) => [entry.name, entry.box, entry.boxMissed])).toEqual([
      ["Hammare", hammerBox, false],
      ["Tång", null, true],
    ]);
  });

  it("looks a föremål up once with the card's photo, saves the box, and counts the call", async () => {
    const { cardId } = await readingCard(a);
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [
        { name: "Hammare", category: "Verktyg", where: "på väggen", confidence: "high" },
        { name: "Okänd grej", category: "Övrigt", where: null, confidence: "low" },
        { name: "Burk matkoll-mock: ai_unavailable", category: "Övrigt", where: null, confidence: "low" },
        { name: "Burk matkoll-mock: ai_invalid", category: "Övrigt", where: null, confidence: "low" },
      ],
      note: null,
      hidden: 0,
    });
    const [hammer, unknown, failing, garbled] = (await loadCardViewIn(a.db, cardId))?.things ?? [];
    as(a);
    located.mockClear();
    const usageBefore = (await adminClient().from("ai_usage").select("id").eq("user_id", a.id)).data?.length ?? 0;

    // The mock finds the hammer where the drawn photo has it.
    expect(await locateThingOnCard(hammer.id)).toEqual(ok({ box: hammerBox }));
    expect(await loadThingForLookupIn(a.db, hammer.id)).toMatchObject({ box: hammerBox });
    // Asked again: the saved box, no second call.
    expect(await locateThingOnCard(hammer.id)).toEqual(ok({ box: hammerBox }));
    expect(located).toHaveBeenCalledTimes(1);

    // Not on the photo: the miss is saved, and never asked again.
    expect(await locateThingOnCard(unknown.id)).toEqual(ok({ box: null }));
    expect(await loadThingForLookupIn(a.db, unknown.id)).toMatchObject({ box: null, boxMissed: true });
    await locateThingOnCard(unknown.id);
    expect(located).toHaveBeenCalledTimes(2);

    // The AI out of reach: nothing is saved, so the next tap tries again.
    expect(await locateThingOnCard(failing.id)).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
    expect(await loadThingForLookupIn(a.db, failing.id)).toMatchObject({ box: null, boxMissed: false });
    // An answer that is not the shape is billed and would likely repeat: it is saved as a miss.
    expect(await locateThingOnCard(garbled.id)).toEqual(ok({ box: null }));
    expect(await loadThingForLookupIn(a.db, garbled.id)).toMatchObject({ box: null, boxMissed: true });
    await locateThingOnCard(garbled.id);
    expect(located).toHaveBeenCalledTimes(4);

    // Story 17.6: the two calls that answered are counted, as the mock (no tokens, no cost).
    const usage = (await adminClient().from("ai_usage").select("model").eq("user_id", a.id)).data ?? [];
    expect(usage.length - usageBefore).toBe(2);
    expect(usage.at(-1)).toEqual({ model: "mock" });
  });

  it("keeps every box and lookup in its household: another user reads, saves and looks up nothing", async () => {
    const { cardId } = await readingCard(a);
    await saveReadingIn(a.db, { photoId: cardId, things: [{ name: "Hammare", category: "Verktyg", where: null, confidence: "high" }], note: null, hidden: 0 });
    const [hammer] = (await loadCardViewIn(a.db, cardId))?.things ?? [];

    expect(await loadCardViewIn(b.db, cardId)).toBeNull();
    expect(await loadThingForLookupIn(b.db, hammer.id)).toBeNull();
    expect(await saveThingBoxIn(b.db, hammer.id, hammerBox)).toBe(false);
    const direct = await b.db.from("thing_item").update({ box_left: 0, box_top: 0, box_width: 1, box_height: 1 }).eq("id", hammer.id).select("id");
    expect(direct.data).toEqual([]);
    // B's own card cannot be saved with A's things, and B's lookup of A's föremål calls no AI.
    as(b);
    located.mockClear();
    expect(await locateThingOnCard(hammer.id)).toMatchObject({ ok: false, error: { code: "things_item_gone" } });
    expect(located).not.toHaveBeenCalled();
    expect(await loadThingForLookupIn(a.db, hammer.id)).toMatchObject({ box: null, boxMissed: false });
  });
});

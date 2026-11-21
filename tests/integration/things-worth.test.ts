import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCardViewIn } from "@/features/things/data/card-view";
import { loadRoomThingsIn } from "@/features/things/data/rooms";
import { insertPlaceIn } from "@/features/things/data/places";
import { insertCardIn, saveReadingIn, uploadCardFile } from "@/features/things/data/photos";
import { loadThingDetailIn } from "@/features/things/data/thing-detail";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import type { Json } from "@/lib/supabase/database.types";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type TestUser } from "./support";

// Värt en titt against local Supabase: save_thing_card saves a föremål's tip (a sentence and a known
// confidence) with the reading, leaves out one that is not that (the föremål is saved either way),
// thing_item_worth_check refuses half a tip, a card read without tips saves as before, and the card's
// page and the föremål's sheet read the tip. Only a drawn photo.

const photo = new Uint8Array(readFileSync(new URL("../fixtures/ai/forrad.png", import.meta.url)));
const files: string[] = [];
let a: TestUser;
let site: string | undefined;

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("worth-a");
});

afterAll(async () => {
  await adminClient().storage.from(thingPhotoBucket).remove(files);
  await deleteTestUsers();
});

async function readingCard(): Promise<string> {
  if (!site) {
    const made = await a.db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true }).select("id").single();
    if (made.error) throw made.error;
    site = made.data.id;
  }
  const place = await insertPlaceIn(a.db, { siteId: site, room: "Boden", part: `Hylla ${randomUUID().slice(0, 8)}` });
  if (place.kind !== "saved") throw new Error(place.kind);
  const cardId = randomUUID();
  const path = thingPhotoPath(a.id, place.id, cardId, "image/png");
  await uploadCardFile(a.db, path, photo, "image/png");
  files.push(path);
  expect(await insertCardIn(a.db, { id: cardId, placeId: place.id, objectPath: path, mediaType: "image/png", width: 1200, height: 900, takenAt: new Date() })).toBe("saved");
  return cardId;
}

const thing = (name: string, worth?: unknown) => ({ name, category: "Hushåll", where_hint: null, confidence: "high", ...(worth === undefined ? {} : { worth }) });

describe("Värt en titt on a card", () => {
  it("saves the tip with the reading and the card's page and the föremål's sheet read it", async () => {
    const cardId = await readingCard();
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [
        { name: "Vas", category: "Hushåll", where: null, confidence: "high", worth: { why: "Ser ut som Gustavsberg. Titta på botten.", confidence: "guess" } },
        { name: "Hammare", category: "Verktyg", where: null, confidence: "high" },
      ],
      note: null,
      hidden: 0,
    });
    const view = await loadCardViewIn(a.db, cardId);
    expect(view?.things.map((entry) => [entry.name, entry.worth])).toEqual([
      ["Vas", { why: "Ser ut som Gustavsberg. Titta på botten.", confidence: "guess" }],
      ["Hammare", null],
    ]);
    const vas = view?.things[0];
    if (!vas) throw new Error("no vas");
    expect((await loadThingDetailIn(a.db, vas.id))?.worth).toEqual({ why: "Ser ut som Gustavsberg. Titta på botten.", confidence: "guess" });
  });

  it("the room's list per category carries the tip of a föremål that has one", async () => {
    const cardId = await readingCard();
    await saveReadingIn(a.db, {
      photoId: cardId,
      things: [
        { name: "Tipsvas", category: "Hushåll", where: null, confidence: "high", worth: { why: "Liknar Rörstrand.", confidence: "unsure" } },
        { name: "Tipslös skål", category: "Hushåll", where: null, confidence: "high" },
      ],
      note: null,
      hidden: 0,
    });
    const view = await loadCardViewIn(a.db, cardId);
    const placeRoom = view?.roomKey;
    if (!site || !placeRoom) throw new Error("no room");
    const list = await loadRoomThingsIn(a.db, site, placeRoom, "Hushåll");
    expect(list.filter((entry) => entry.name.startsWith("Tips")).map((entry) => [entry.name, entry.worth ?? null])).toEqual([
      ["Tipslös skål", null],
      ["Tipsvas", { why: "Liknar Rörstrand.", confidence: "unsure" }],
    ]);
  });

  it("leaves out a tip that is not a sentence and a known confidence, and still reads the card", async () => {
    const cardId = await readingCard();
    const { error } = await a.db.rpc("save_thing_card", {
      photo: cardId,
      things: [
        thing("Tom", { why: "  ", confidence: "sure" }),
        thing("Okänd säkerhet", { why: "Liknar Arabia.", confidence: "kanske" }),
        thing("Ingen säkerhet", { why: "Liknar Arabia." }),
        thing("För lång", { why: "x".repeat(201), confidence: "sure" }),
        thing("Text", "dyrgrip"),
        thing("Bra", { why: "  Liknar Orrefors.  ", confidence: "sure" }),
      ] as Json,
    });
    expect(error).toBeNull();
    const view = await loadCardViewIn(a.db, cardId);
    expect(view?.status).toBe("done");
    expect(view?.things.map((entry) => [entry.name, entry.worth])).toEqual([
      ["Tom", null],
      ["Okänd säkerhet", null],
      ["Ingen säkerhet", null],
      ["För lång", null],
      ["Text", null],
      ["Bra", { why: "Liknar Orrefors.", confidence: "sure" }],
    ]);
  });

  it("refuses half a tip written directly (thing_item_worth_check)", async () => {
    const cardId = await readingCard();
    await saveReadingIn(a.db, { photoId: cardId, things: [{ name: "Vas", category: "Hushåll", where: null, confidence: "high" }], note: null, hidden: 0 });
    const view = await loadCardViewIn(a.db, cardId);
    const id = view?.things[0]?.id;
    if (!id) throw new Error("no thing");
    const half = await a.db.from("thing_item").update({ worth_why: "Liknar Arabia." }).eq("id", id);
    expect(half.error?.code).toBe("23514");
    const unknown = await a.db.from("thing_item").update({ worth_why: "Liknar Arabia.", worth_confidence: "kanske" }).eq("id", id);
    expect(unknown.error?.code).toBe("23514");
    const whole = await a.db.from("thing_item").update({ worth_why: "Liknar Arabia.", worth_confidence: "unsure" }).eq("id", id);
    expect(whole.error).toBeNull();
  });
});

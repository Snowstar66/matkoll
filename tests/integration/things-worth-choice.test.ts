import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCardViewIn } from "@/features/things/data/card-view";
import { setCardTitleIn } from "@/features/things/data/card-text";
import { insertPlaceIn } from "@/features/things/data/places";
import { insertCardIn, saveReadingIn, uploadCardFile } from "@/features/things/data/photos";
import { loadRoomsIn } from "@/features/things/data/rooms";
import { applyWorthRecommendationIn, loadThingForWorthIn, setWorthByUserIn } from "@/features/things/data/worth";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type TestUser } from "./support";

// Värdetips, the user's own choices against local Supabase: worth_set_by_user goes before the AI's tip both ways,
// a new reading (Ta om) never overrides it (it follows a föremål by name), the AI's recommendation only
// changes a star the user never touched, the card's line and names are saved with the reading and the user's own
// name follows a Ta om, and another household can read or change none of it (RLS).

const photo = new Uint8Array(readFileSync(new URL("../fixtures/ai/forrad.png", import.meta.url)));
const files: string[] = [];
let a: TestUser;
let b: TestUser;
let site: string | undefined;
let place: string | undefined;

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("worth-choice-a");
  b = await createTestUser("worth-choice-b");
});

afterAll(async () => {
  await adminClient().storage.from(thingPhotoBucket).remove(files);
  await deleteTestUsers();
});

async function newCard(replacesId?: string): Promise<string> {
  if (!site) {
    const made = await a.db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true }).select("id").single();
    if (made.error) throw made.error;
    site = made.data.id;
    const made2 = await insertPlaceIn(a.db, { siteId: site, room: "Boden", part: "Hylla" });
    if (made2.kind !== "saved") throw new Error(made2.kind);
    place = made2.id;
  }
  const cardId = randomUUID();
  const path = thingPhotoPath(a.id, place!, cardId, "image/png");
  await uploadCardFile(a.db, path, photo, "image/png");
  files.push(path);
  expect(await insertCardIn(a.db, { id: cardId, placeId: place!, objectPath: path, mediaType: "image/png", width: 1200, height: 900, takenAt: new Date(), replacesId })).toBe("saved");
  return cardId;
}

const tip = { why: "Ser ut som Gustavsberg.", confidence: "guess" };
const read = (name: string, worth?: typeof tip) => ({ name, category: "Hushåll", where: null, confidence: "high", ...(worth ? { worth } : {}) });

describe("the user's own star", () => {
  it("goes before the AI's tip both ways, and the AI's recommendation only changes a star never touched", async () => {
    const card = await newCard();
    await saveReadingIn(a.db, { photoId: card, things: [read("Vas", tip), read("Skål"), read("Kanna", tip)], note: null, hidden: 0 });
    const view = await loadCardViewIn(a.db, card);
    const [vas, skal, kanna] = view!.things;
    // Nothing touched: the AI's tip is the star.
    expect(vas!.worth).toMatchObject({ why: tip.why });
    expect(skal!.worth).toBeNull();
    // The user stars a föremål the AI did not, and removes the AI's star.
    expect(await setWorthByUserIn(a.db, skal!.id, true)).toMatchObject({ starred: true, setBy: "user" });
    expect(await setWorthByUserIn(a.db, vas!.id, false)).toMatchObject({ starred: false, setBy: "removed" });
    const after = (await loadCardViewIn(a.db, card))!.things;
    expect(after.map((entry) => [entry.name, entry.worth ? (entry.worth.byUser ? "user" : "ai") : null])).toEqual([
      ["Vas", null],
      ["Skål", "user"],
      ["Kanna", "ai"],
    ]);
    // The recommendation changes only the one never touched.
    expect(await applyWorthRecommendationIn(a.db, vas!.id, null)).toBe(false);
    expect(await applyWorthRecommendationIn(a.db, skal!.id, { why: "x", confidence: "sure" })).toBe(false);
    expect(await applyWorthRecommendationIn(a.db, kanna!.id, null)).toBe(true);
    expect((await loadThingForWorthIn(a.db, kanna!.id))?.state).toMatchObject({ starred: false, setBy: null });
    // The star counts of the room follow the same rule: only the user's Skål is left.
    const rooms = await loadRoomsIn(a.db, site!);
    expect(rooms.find((room) => room.key === "boden")?.starred).toBe(1);
  });

  it("follows a föremål over a Ta om by name: the new reading never overrides it", async () => {
    const first = await newCard();
    await saveReadingIn(a.db, { photoId: first, things: [read("Vas", tip), read("Skål"), read("Lampa", tip), read("Mugg")], note: null, hidden: 0 });
    const things = (await loadCardViewIn(a.db, first))!.things;
    const id = (name: string) => things.find((entry) => entry.name === name)!.id;
    await setWorthByUserIn(a.db, id("Vas"), false);
    await setWorthByUserIn(a.db, id("Skål"), true);
    await setWorthByUserIn(a.db, id("Mugg"), true);
    const second = await newCard(first);
    // The new reading: Vas with a new tip, Skål without, Lampa with a tip, and Mugg is gone from the card.
    await saveReadingIn(a.db, { photoId: second, things: [read("Vas", tip), read("Skål"), read("Lampa", tip)], note: null, hidden: 0 });
    const now = (await loadCardViewIn(a.db, second))!.things;
    expect(now.map((entry) => [entry.name, entry.worth ? (entry.worth.byUser ? "user" : "ai") : null])).toEqual([
      ["Vas", null],
      ["Skål", "user"],
      ["Lampa", "ai"],
    ]);
    // A removed star also drops the new tip (both columns or neither).
    const raw = await a.db.from("thing_item").select("name, worth_why, worth_confidence, worth_set_by_user").eq("photo_id", second).order("position");
    expect(raw.data).toEqual([
      { name: "Vas", worth_why: null, worth_confidence: null, worth_set_by_user: false },
      { name: "Skål", worth_why: null, worth_confidence: null, worth_set_by_user: true },
      { name: "Lampa", worth_why: tip.why, worth_confidence: "guess", worth_set_by_user: null },
    ]);
  });
});

describe("the card's line and names", () => {
  it("saves the line and the AI's short name with the reading, and the user's own name follows a Ta om", async () => {
    const first = await newCard();
    await saveReadingIn(a.db, { photoId: first, things: [read("Vas")], note: null, hidden: 0, summary: "Mest glas och porslin", title: "Glashyllan" });
    let view = await loadCardViewIn(a.db, first);
    expect(view).toMatchObject({ summary: "Mest glas och porslin", aiTitle: "Glashyllan", userTitle: null });
    expect(await setCardTitleIn(a.db, first, "Mormors hylla")).toBe(true);
    const second = await newCard(first);
    await saveReadingIn(a.db, { photoId: second, things: [read("Vas")], note: null, hidden: 0, summary: null, title: "Nya hyllan" });
    view = await loadCardViewIn(a.db, second);
    // A card without a clear line has none; the user's name came along, the AI's own name is the new one.
    expect(view).toMatchObject({ summary: null, aiTitle: "Nya hyllan", userTitle: "Mormors hylla" });
  });

  it("refuses a line over 80 characters and a name over 40 (the checks)", async () => {
    const card = await newCard();
    const long = await a.db.from("thing_photo").update({ summary: "x".repeat(81) }).eq("id", card);
    expect(long.error?.code).toBe("23514");
    const name = await a.db.from("thing_photo").update({ user_title: "y".repeat(41) }).eq("id", card);
    expect(name.error?.code).toBe("23514");
  });
});

describe("another household", () => {
  it("can neither read nor change the star or the names (RLS)", async () => {
    const card = await newCard();
    await saveReadingIn(a.db, { photoId: card, things: [read("Vas", tip)], note: null, hidden: 0, summary: "Mest glas", title: "Glashyllan" });
    const vas = (await loadCardViewIn(a.db, card))!.things[0]!;
    expect(await loadThingForWorthIn(b.db, vas.id)).toBeNull();
    expect(await setWorthByUserIn(b.db, vas.id, false)).toBeNull();
    expect(await setCardTitleIn(b.db, card, "Stulet")).toBe(false);
    expect(await loadCardViewIn(b.db, card)).toBeNull();
    const own = await loadCardViewIn(a.db, card);
    expect(own?.userTitle).toBeNull();
    expect(own?.things[0]?.worth).toMatchObject({ why: tip.why });
  });
});

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changeQuantityIn, loadChangesIn, loadCountIn, restoreCountIn, setQuantityIn, stopCountIn, undoChangeIn } from "@/features/things/data/count";
import { removeItemIn, restoreItemIn } from "@/features/things/data/items";
import { mergeItemsIn } from "@/features/things/data/merge";
import { insertPlaceIn } from "@/features/things/data/places";
import { insertCardIn, saveReadingIn, uploadCardFile } from "@/features/things/data/photos";
import { searchThingsIn } from "@/features/things/data/search";
import { loadRoomThingsIn } from "@/features/things/data/rooms";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, type TestUser } from "./support";

// Ta och fyll på (Story 18.23, AD-4, AD-5) against local Supabase: a card's
// count is saved with its history's first row, Ta and Fyll på change the count
// atomically (two at once both count, never below 0), Ångra gives back and
// removes the change, Räkna, Sluta räkna and its Ångra, at most 50 changes, a
// new card's count wins over the old one and clears its changes (by merge and
// by Ta om), a removed föremål comes back with its count, and the search and
// the room's list give the count. Isolation from another household is in
// household-isolation.test.ts. Only a drawn photo; no AI.

const photo = new Uint8Array(readFileSync(new URL("../fixtures/ai/forrad.png", import.meta.url)));
const files: string[] = [];
let a: TestUser;
const sites = new Map<string, string>();

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("count-a");
});

afterAll(async () => {
  await adminClient().storage.from(thingPhotoBucket).remove(files);
  await deleteTestUsers();
});

async function siteOf(user: TestUser): Promise<string> {
  const known = sites.get(user.id);
  if (known) return known;
  const site = await user.db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true }).select("id").single();
  if (site.error) throw site.error;
  sites.set(user.id, site.data.id);
  return site.data.id;
}

async function card(user: TestUser, room: string, part: string | null, replacesId: string | null = null, placeId?: string): Promise<{ placeId: string; cardId: string }> {
  let id = placeId;
  if (!id) {
    const place = await insertPlaceIn(user.db, { siteId: await siteOf(user), room, part });
    if (place.kind !== "saved") throw new Error(place.kind);
    id = place.id;
  }
  const cardId = randomUUID();
  const path = thingPhotoPath(user.id, id, cardId, "image/png");
  await uploadCardFile(user.db, path, photo, "image/png");
  files.push(path);
  expect(await insertCardIn(user.db, { id: cardId, placeId: id, objectPath: path, mediaType: "image/png", width: 1200, height: 900, takenAt: new Date(), replacesId })).toBe("saved");
  return { placeId: id, cardId };
}

const read = (name: string, count: number | null = null) => ({ name, category: "Hushåll", where: "översta hyllan", confidence: "high", box: null, count });

async function itemOf(cardId: string, name: string): Promise<{ id: string; quantity: number | null; same_as: string | null }> {
  const { data, error } = await a.db.from("thing_item").select("id, quantity, same_as").eq("photo_id", cardId).eq("name", name).single();
  if (error) throw error;
  return data;
}

const kinds = async (itemId: string) => ((await loadChangesIn(a.db, [itemId])).get(itemId) ?? []).map((change) => [change.kind, change.delta, change.quantityAfter, change.cleared]);

describe("the count of a föremål (Story 18.23)", () => {
  it("saves a card's count (a whole number from 1 to 999 only) with the history's first row, and nothing for the rest", async () => {
    const { cardId } = await card(a, "Förrådet", "Översta hyllan");
    await saveReadingIn(a.db, { photoId: cardId, things: [read("Gravljus", 5), read("Hammare"), read("Värmeljus", 1000), read("Skruvar", 2.5)], note: null, hidden: 0 });
    const gravljus = await itemOf(cardId, "Gravljus");
    expect(gravljus.quantity).toBe(5);
    expect(await kinds(gravljus.id)).toEqual([["card", null, 5, null]]);
    for (const name of ["Hammare", "Värmeljus", "Skruvar"]) {
      const other = await itemOf(cardId, name);
      expect(other.quantity, name).toBeNull();
      expect(await kinds(other.id), name).toEqual([]);
    }
    // The search and the room's list give the count.
    expect((await searchThingsIn(a.db, ["gravljus"])).find((hit) => hit.id === gravljus.id)?.quantity).toBe(5);
    expect((await loadRoomThingsIn(a.db, await siteOf(a), "förrådet", "Hushåll")).find((thing) => thing.id === gravljus.id)?.quantity).toBe(5);
  });

  it("never fails a card for a count that is not a number, and saves none for it", async () => {
    const { cardId } = await card(a, "Förrådet", "Bänken");
    const { error } = await a.db.rpc("save_thing_card", {
      photo: cardId,
      things: [
        { name: "Text", category: "Hushåll", where_hint: null, confidence: "high", count: "5" },
        { name: "Bokstäver", category: "Hushåll", where_hint: null, confidence: "high", count: "abc" },
        { name: "Lista", category: "Hushåll", where_hint: null, confidence: "high", count: [3] },
        { name: "Enorm", category: "Hushåll", where_hint: null, confidence: "high", count: 1e300 },
      ],
    });
    expect(error).toBeNull();
    for (const name of ["Text", "Bokstäver", "Lista", "Enorm"]) expect((await itemOf(cardId, name)).quantity, name).toBeNull();
  });

  it("takes and fills up at once, never below 0 nor above 9999, and Ångra gives back and removes the change", async () => {
    const { cardId } = await card(a, "Förrådet", "Mellersta hyllan");
    await saveReadingIn(a.db, { photoId: cardId, things: [read("Batterier", 8)], note: null, hidden: 0 });
    const { id } = await itemOf(cardId, "Batterier");
    const took = await changeQuantityIn(a.db, id, -2);
    expect(took).toMatchObject({ quantity: 6 });
    const filled = await changeQuantityIn(a.db, id, 3);
    expect(filled).toMatchObject({ quantity: 9 });
    expect(await changeQuantityIn(a.db, id, -50)).toMatchObject({ quantity: 0 });
    expect(await kinds(id)).toEqual([
      ["take", -9, 0, null],
      ["refill", 3, 9, null],
      ["take", -2, 6, null],
      ["card", null, 8, null],
    ]);
    expect(await undoChangeIn(a.db, (filled as { changeId: string }).changeId)).toBe(0);
    expect((await kinds(id)).map(([kind]) => kind)).toEqual(["take", "take", "card"]);
    expect(await undoChangeIn(a.db, (filled as { changeId: string }).changeId)).toBe("gone");
    await setQuantityIn(a.db, id, 9999);
    expect(await changeQuantityIn(a.db, id, 999)).toMatchObject({ quantity: 9999 });
    // Bad steps are refused by the database too.
    expect((await a.db.rpc("change_thing_quantity", { item: id, delta: 0 })).error?.code).toBe("22023");
    expect((await a.db.rpc("change_thing_quantity", { item: id, delta: 1000 })).error?.code).toBe("22023");
    expect((await a.db.rpc("set_thing_quantity", { item: id, amount: -1 })).error?.code).toBe("22023");
  });

  it("counts both of two changes made at the same time, and never goes below 0", async () => {
    const { cardId } = await card(a, "Förrådet", "Golvet");
    await saveReadingIn(a.db, { photoId: cardId, things: [read("Toalettrullar", 12)], note: null, hidden: 0 });
    const { id } = await itemOf(cardId, "Toalettrullar");
    // Four changes at once from the same account, as from two phones.
    const results = await Promise.all([
      changeQuantityIn(a.db, id, -3),
      changeQuantityIn(a.db, id, -4),
      changeQuantityIn(a.db, id, 2),
      changeQuantityIn(a.db, id, -1),
    ]);
    expect(results.every((result) => typeof result === "object")).toBe(true);
    expect((await loadCountIn(a.db, id))?.quantity).toBe(6);
    expect((await kinds(id)).filter(([kind]) => kind !== "card")).toHaveLength(4);
    const rush = await Promise.all(Array.from({ length: 8 }, () => changeQuantityIn(a.db, id, -1)));
    expect(rush.every((result) => typeof result === "object")).toBe(true);
    expect((await loadCountIn(a.db, id))?.quantity).toBe(0);
  });

  it("counts a föremål that was not counted with Räkna, says it is not counted to Ta, and Sluta räkna has an Ångra", async () => {
    const { cardId } = await card(a, "Garaget", null);
    await saveReadingIn(a.db, { photoId: cardId, things: [read("Hammare")], note: null, hidden: 0 });
    const { id } = await itemOf(cardId, "Hammare");
    expect(await changeQuantityIn(a.db, id, -1)).toBe("not_counted");
    expect(await setQuantityIn(a.db, id, 1)).toMatchObject({ quantity: 1 });
    await changeQuantityIn(a.db, id, 1);
    expect(await kinds(id)).toEqual([
      ["refill", 1, 2, null],
      ["set", null, 1, null],
    ]);
    const snapshot = await stopCountIn(a.db, id);
    if (snapshot === "gone") throw new Error("gone");
    expect(snapshot.quantity).toBe(2);
    expect(snapshot.changes).toHaveLength(2);
    expect((await loadCountIn(a.db, id))?.quantity).toBeNull();
    expect(await kinds(id)).toEqual([]);
    expect(await stopCountIn(a.db, id)).toBe("gone");
    expect(await restoreCountIn(a.db, snapshot)).toBe("restored");
    expect((await loadCountIn(a.db, id))?.quantity).toBe(2);
    expect(await kinds(id)).toEqual([
      ["refill", 1, 2, null],
      ["set", null, 1, null],
    ]);
    // Counted again since: the old count does not come back over it.
    expect(await restoreCountIn(a.db, snapshot)).toBe("counted");
  });

  it("keeps at most 50 changes per föremål, the newest", async () => {
    const { cardId } = await card(a, "Garaget", "Hyllan");
    await saveReadingIn(a.db, { photoId: cardId, things: [read("Värmeljus", 100)], note: null, hidden: 0 });
    const { id } = await itemOf(cardId, "Värmeljus");
    for (let step = 0; step < 55; step++) await changeQuantityIn(a.db, id, -1);
    const history = await kinds(id);
    expect(history).toHaveLength(50);
    expect(history[0]).toEqual(["take", -1, 45, null]);
  });

  it("lets a new card's count win when it is merged into the old föremål, and clears the older changes", async () => {
    const first = await card(a, "Källaren", "Hyllan");
    await saveReadingIn(a.db, { photoId: first.cardId, things: [read("Gravljus", 5), read("Glödlampor", 3)], note: null, hidden: 0 });
    const kept = await itemOf(first.cardId, "Gravljus");
    const lamps = await itemOf(first.cardId, "Glödlampor");
    await changeQuantityIn(a.db, kept.id, -2);
    await changeQuantityIn(a.db, kept.id, 1);
    await changeQuantityIn(a.db, lamps.id, -1);
    // A new card of the same room: it counts the gravljus (4) but cannot count the glödlampor.
    const second = await card(a, "Källaren", null);
    await saveReadingIn(a.db, { photoId: second.cardId, things: [read("Gravljus", 4), read("Glödlampor")], note: null, hidden: 0 });
    const newCandles = await itemOf(second.cardId, "Gravljus");
    const newLamps = await itemOf(second.cardId, "Glödlampor");
    expect(await mergeItemsIn(a.db, second.cardId, [{ item: newCandles.id, target: kept.id }, { item: newLamps.id, target: lamps.id }])).toBe(2);
    expect((await loadCountIn(a.db, kept.id))?.quantity).toBe(4);
    expect(await kinds(kept.id)).toEqual([["card", null, 4, 2]]);
    expect((await itemOf(second.cardId, "Gravljus")).quantity).toBeNull();
    // Counted from the merged one too: it holds no count of its own.
    expect((await loadCountIn(a.db, newCandles.id))?.itemId).toBe(kept.id);
    expect((await changeQuantityIn(a.db, newCandles.id, -1)) as { quantity: number }).toMatchObject({ quantity: 3 });
    // Not counted on the new card: the old count and history stay.
    expect((await loadCountIn(a.db, lamps.id))?.quantity).toBe(2);
    expect((await kinds(lamps.id)).map(([kind]) => kind)).toEqual(["take", "card"]);
  });

  it("keeps the count of a card that is taken again (Ta om) when the new one cannot count it, and lets a new count win", async () => {
    const first = await card(a, "Vinden", "Lådan");
    await saveReadingIn(a.db, { photoId: first.cardId, things: [read("Gravljus", 5), read("Batterier", 8)], note: null, hidden: 0 });
    const candles = await itemOf(first.cardId, "Gravljus");
    const batteries = await itemOf(first.cardId, "Batterier");
    await changeQuantityIn(a.db, candles.id, -2);
    await changeQuantityIn(a.db, batteries.id, -1);
    const again = await card(a, "Vinden", "Lådan", first.cardId, first.placeId);
    await saveReadingIn(a.db, { photoId: again.cardId, things: [read("Gravljus"), read("Batterier", 6)], note: null, hidden: 0 });
    // The old card is gone with its föremål.
    expect((await a.db.from("thing_photo").select("id").eq("id", first.cardId)).data).toEqual([]);
    const newCandles = await itemOf(again.cardId, "Gravljus");
    expect(newCandles.quantity).toBe(3);
    expect((await kinds(newCandles.id)).map(([kind, delta]) => [kind, delta])).toEqual([
      ["take", -2],
      ["card", null],
    ]);
    const newBatteries = await itemOf(again.cardId, "Batterier");
    expect(newBatteries.quantity).toBe(6);
    expect(await kinds(newBatteries.id)).toEqual([["card", null, 6, 1]]);
  });

  it("brings a removed föremål back with its count and history", async () => {
    const { cardId } = await card(a, "Förrådet", "Lådan");
    await saveReadingIn(a.db, { photoId: cardId, things: [read("Glödlampor E27", 4)], note: null, hidden: 0 });
    const { id } = await itemOf(cardId, "Glödlampor E27");
    await changeQuantityIn(a.db, id, -4);
    const snapshot = await removeItemIn(a.db, id);
    if (!snapshot) throw new Error("not removed");
    expect(snapshot.quantity).toBe(0);
    expect(snapshot.changes.map((change) => change.kind)).toEqual(["card", "take"]);
    expect(await restoreItemIn(a.db, snapshot)).toBe("restored");
    expect((await loadCountIn(a.db, id))?.quantity).toBe(0);
    expect((await kinds(id)).map(([kind]) => kind)).toEqual(["take", "card"]);
  });
});

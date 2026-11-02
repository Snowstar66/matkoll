import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { othersOf } from "@/features/household";
import { loadMembersIn } from "@/features/household/data/household";
import { listCheckRowsIn, setCheckIn } from "@/features/shopping/data/checks";
import { addCustomItemIn, listCustomItemsIn } from "@/features/shopping/data/custom-items";
import { customLineKey } from "@/features/shopping/domain/line-key";
import { lineMarksOf } from "@/features/shopping/domain/line-marks";
import { changeQuantityIn, loadCountIn, restoreCountIn, stopCountIn } from "@/features/things/data/count";
import { removeItemIn, restoreItemIn } from "@/features/things/data/items";
import { mergeItemsIn } from "@/features/things/data/merge";
import { insertPlaceIn } from "@/features/things/data/places";
import { insertCardIn, saveReadingIn, uploadCardFile } from "@/features/things/data/photos";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, createTestUser, deleteTestUsers, householdOf, moveToHousehold, type TestUser } from "./support";

// Se vem som gjort vad (Story 21.3) against local Supabase: a household of two
// (a and Martina) sees who else checked off or added a line, and who last
// changed a pantry item or a föremål; another household (b) sees none of it;
// nobody can name someone else as the one who changed a row; and a föremål's
// history keeps who made each change through a merge, Ta om, Sluta räkna's
// Ångra and a removed föremål's Ångra. Only a drawn photo; no AI.

const photo = new Uint8Array(readFileSync(new URL("../fixtures/ai/forrad.png", import.meta.url)));
const files: string[] = [];
let a: TestUser;
let martina: TestUser;
let b: TestUser;
let site: string;

beforeAll(async () => {
  localSupabaseUrl();
  a = await createTestUser("who-a");
  martina = await createTestUser("who-martina");
  b = await createTestUser("who-b");
  await moveToHousehold(martina, await householdOf(a.id));
  const named = await adminClient().from("household_member").update({ display_name: "Martina", color: "sky" }).eq("user_id", martina.id);
  if (named.error) throw named.error;
  const made = await a.db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true }).select("id").single();
  if (made.error) throw made.error;
  site = made.data.id;
});

afterAll(async () => {
  await adminClient().storage.from(thingPhotoBucket).remove(files);
  await adminClient().from("household").delete().eq("id", await householdOf(a.id));
  await deleteTestUsers();
});

const read = (name: string, count: number | null = null) => ({ name, category: "Hushåll", where: "översta hyllan", confidence: "high", box: null, count });

async function card(room: string, part: string | null, replacesId: string | null = null, placeId?: string): Promise<{ placeId: string; cardId: string }> {
  let id = placeId;
  if (!id) {
    const place = await insertPlaceIn(a.db, { siteId: site, room, part });
    if (place.kind !== "saved") throw new Error(place.kind);
    id = place.id;
  }
  const cardId = randomUUID();
  const path = thingPhotoPath(a.id, id, cardId, "image/png");
  await uploadCardFile(a.db, path, photo, "image/png");
  files.push(path);
  expect(await insertCardIn(a.db, { id: cardId, placeId: id, objectPath: path, mediaType: "image/png", width: 1200, height: 900, takenAt: new Date(), replacesId })).toBe("saved");
  return { placeId: id, cardId };
}

async function itemOf(cardId: string, name: string): Promise<string> {
  const { data, error } = await a.db.from("thing_item").select("id").eq("photo_id", cardId).eq("name", name).single();
  if (error) throw error;
  return data.id;
}

/** Who made each change of a föremål, newest first. */
async function makers(itemId: string): Promise<[string, string | null][]> {
  const { data, error } = await a.db.from("thing_change").select("kind, user_id, created_at").eq("item_id", itemId).order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => [row.kind, row.user_id]);
}

describe("who did what (Story 21.3)", () => {
  it("marks the lines Martina checked off or added for a, nothing for her own, and nothing for b", async () => {
    const citron = randomUUID();
    const smor = randomUUID();
    expect(await addCustomItemIn(martina.db, { id: citron, label: "citron", ingredientId: null, amount: null, unit: null })).toMatchObject({ id: citron });
    expect(await addCustomItemIn(a.db, { id: smor, label: "smör", ingredientId: null, amount: null, unit: null })).toMatchObject({ id: smor });
    expect(await setCheckIn(martina.db, null, customLineKey(smor), true)).toBe("saved");

    const marksFor = async (user: TestUser) =>
      lineMarksOf(
        await listCheckRowsIn(user.db, null),
        (await listCustomItemsIn(user.db)).map((item) => ({ key: customLineKey(item.id), by: item.by, at: item.at })),
        othersOf(await loadMembersIn(user.db)),
      );
    const forA = await marksFor(a);
    expect(forA[customLineKey(citron)]).toMatchObject({ addedBy: { name: "Martina", tone: "sky" } });
    expect(forA[customLineKey(smor)]).toMatchObject({ checkedBy: { name: "Martina", tone: "sky" } });
    expect(forA[customLineKey(smor)].addedBy).toBeUndefined();
    // Martina sees her own work unmarked, and a's item as added by a.
    const forMartina = await marksFor(martina);
    expect(forMartina[customLineKey(citron)]).toBeUndefined();
    expect(forMartina[customLineKey(smor)]).toMatchObject({ addedBy: { tone: "mint" } });
    expect(forMartina[customLineKey(smor)].checkedBy).toBeUndefined();
    // Another household: none of it.
    expect(await marksFor(b)).toEqual({});
    expect(await listCheckRowsIn(b.db, null)).toEqual([]);
  });

  it("stamps who last changed a pantry item and a föremål from the session, and nobody can name someone else", async () => {
    const ingredient = await a.db.from("ingredient").insert({ name: "Mjölk", normalized_name: `mjolk-${randomUUID()}`, section: "Mejeri", location: "Kyl" }).select("id").single();
    if (ingredient.error) throw ingredient.error;
    const added = await a.db
      .from("pantry_item")
      .insert({ site_id: site, ingredient_id: ingredient.data.id, location: "Kyl", amount: 1, unit: "l", updated_by: martina.id })
      .select("id, user_id, updated_by, updated_at")
      .single();
    if (added.error) throw added.error;
    expect(added.data).toMatchObject({ user_id: a.id, updated_by: a.id });
    const changed = await martina.db.from("pantry_item").update({ amount: 2 }).eq("id", added.data.id).select("updated_by, updated_at").single();
    expect(changed.data?.updated_by).toBe(martina.id);
    expect(Date.parse(changed.data!.updated_at!)).toBeGreaterThanOrEqual(Date.parse(added.data.updated_at!));
    const forged = await a.db.from("pantry_item").update({ updated_by: martina.id, amount: 3 }).eq("id", added.data.id).select("updated_by").single();
    expect(forged.data?.updated_by).toBe(a.id);
    // b can neither see nor change it.
    expect((await b.db.from("pantry_item").update({ amount: 9 }).eq("id", added.data.id).select("id")).data).toEqual([]);

    const { cardId } = await card("Garaget", null);
    await saveReadingIn(a.db, { photoId: cardId, things: [read("Hammare")], note: null, hidden: 0 });
    const hammer = await itemOf(cardId, "Hammare");
    const renamed = await martina.db.from("thing_item").update({ name: "Släggan" }).eq("id", hammer).select("updated_by").single();
    expect(renamed.data?.updated_by).toBe(martina.id);
    const count = await loadCountIn(a.db, hammer, othersOf(await loadMembersIn(a.db)));
    expect(count?.lastChange).toMatchObject({ name: "Martina", added: false });
  });

  it("keeps who made each change of a föremål through a merge, Ta om, Sluta räkna and a removed föremål's Ångra", async () => {
    // Merge: Martina takes from the new card's föremål before a merges it into the old one.
    const first = await card("Källaren", "Hyllan");
    await saveReadingIn(a.db, { photoId: first.cardId, things: [read("Gravljus", 5)], note: null, hidden: 0 });
    const kept = await itemOf(first.cardId, "Gravljus");
    const second = await card("Källaren", null);
    await saveReadingIn(a.db, { photoId: second.cardId, things: [read("Gravljus", 4)], note: null, hidden: 0 });
    const fresh = await itemOf(second.cardId, "Gravljus");
    await changeQuantityIn(martina.db, fresh, -1);
    expect(await mergeItemsIn(a.db, second.cardId, [{ item: fresh, target: kept }])).toBe(1);
    expect(await makers(kept)).toEqual([
      ["take", martina.id],
      ["card", a.id],
    ]);
    const names = (await loadCountIn(a.db, kept, othersOf(await loadMembersIn(a.db))))?.changes.map((change) => change.who?.name ?? null);
    expect(names).toEqual(["Martina", null]);

    // Ta om: the new card cannot count it, so it takes over the old history with its makers.
    const old = await card("Vinden", "Lådan");
    await saveReadingIn(a.db, { photoId: old.cardId, things: [read("Batterier", 8)], note: null, hidden: 0 });
    await changeQuantityIn(martina.db, await itemOf(old.cardId, "Batterier"), -2);
    const again = await card("Vinden", "Lådan", old.cardId, old.placeId);
    await saveReadingIn(a.db, { photoId: again.cardId, things: [read("Batterier")], note: null, hidden: 0 });
    const batteries = await itemOf(again.cardId, "Batterier");
    expect((await makers(batteries)).find(([kind]) => kind === "take")).toEqual(["take", martina.id]);

    // Sluta räkna and its Ångra.
    const snapshot = await stopCountIn(a.db, batteries);
    if (typeof snapshot === "string") throw new Error(snapshot);
    expect(await restoreCountIn(a.db, snapshot)).toBe("restored");
    expect((await makers(batteries)).find(([kind]) => kind === "take")).toEqual(["take", martina.id]);

    // A removed föremål's Ångra.
    const removed = await removeItemIn(a.db, batteries);
    if (!removed) throw new Error("not removed");
    expect(await restoreItemIn(a.db, removed)).toBe("restored");
    expect((await makers(batteries)).find(([kind]) => kind === "take")).toEqual(["take", martina.id]);
  });

  it("puts back a maker only from the caller's household; anyone else becomes the caller", async () => {
    const { cardId } = await card("Förrådet", null);
    await saveReadingIn(a.db, { photoId: cardId, things: [read("Ljus", 3)], note: null, hidden: 0 });
    const candles = await itemOf(cardId, "Ljus");
    const put = await a.db.rpc("put_thing_changes", {
      item: candles,
      changes: [
        { kind: "take", delta: -1, quantity_after: 2, created_at: "2026-11-01T10:00:00Z", user_id: b.id },
        { kind: "take", delta: -1, quantity_after: 1, created_at: "2026-11-01T11:00:00Z", user_id: martina.id },
        { kind: "take", delta: -1, quantity_after: 0, created_at: "2026-11-01T12:00:00Z", user_id: "not a uuid" },
      ],
    });
    expect(put.error).toBeNull();
    expect((await makers(candles)).filter(([kind]) => kind === "take")).toEqual([
      ["take", a.id],
      ["take", martina.id],
      ["take", a.id],
    ]);
    // b may not put changes on A's föremål.
    expect((await b.db.rpc("put_thing_changes", { item: candles, changes: [] })).error?.code).toBe("MK440");
  });
});

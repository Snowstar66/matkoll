import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placePhotoBucket, placePhotoPath } from "@/features/pantry/domain/place-photo";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, type Db, type TableName, type TestUser } from "./support";

// Household isolation (Story 17.1, AD-4, NFR-11): with two accounts that both
// hold data, account B can neither read, change, delete nor insert as account
// A, in every table of the public schema and in the photo buckets (the
// pantry's and, Epic 18, the things'). The
// tables come from the live schema, not from a list kept here: a table that a
// migration adds and this file does not cover fails the first test by name.
// Each table's own policies are also tried one by one in its feature's test;
// this file is the one place that checks all of them against the same data.

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const buckets = [placePhotoBucket, thingPhotoBucket];

/** What A owns, so a later table's row can point at an earlier table's. */
type Seed = {
  siteId: string;
  ingredientId: string;
  recipeId: string;
  planId: string;
  storeId: string;
  placeId: string;
  thingPhotoId: string;
};

type Coverage = {
  /** A row for the table as `owner`; foreign keys come from `seed`. */
  row: (seed: Seed, ownerId: string) => Record<string, unknown>;
};

// Story 20.3: tables that are not one user's own. The owner of a feedback row may
// not read it back (only the app's owner may), and app_owner has no user at all;
// tests/integration/feedback.test.ts covers both, with the same intruders.
const coveredInFeedbackTest = ["app_owner", "feedback"];

type IsolatedTable = Exclude<TableName, "feedback">;

// One entry per table in the public schema. Typed by the generated types, so a
// new table is a type error here too; the live schema check below is the one
// that names it even when the types were not regenerated.
const coverage: Record<IsolatedTable, Coverage> = {
  ai_setting: { row: () => ({ provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" }) },
  ai_usage: { row: () => ({ model: "claude-haiku-5-5", input_tokens: 1200, output_tokens: 300 }) },
  // Story 17.9: the hash is never granted for reading, so the generic checks below read A's row by id.
  api_key: { row: () => ({ key_hash: sha256(randomUUID()), label: "Siri" }) },
  ai_job: {
    row: () => ({ kind: "suggest", client_key: randomUUID(), expires_at: new Date(Date.now() + 175 * 60_000).toISOString() }),
  },
  ingredient: {
    row: () => ({ name: "Gul lök", normalized_name: `gul lök ${randomUUID()}`, section: "Frukt och grönt", location: "Skafferi", default_unit: "st" }),
  },
  ingredient_synonym: { row: (s) => ({ ingredient_id: s.ingredientId, normalized: `lök ${randomUUID()}` }) },
  meal_plan: { row: () => ({ name: "Vecka 44 (extra)" }) },
  meal_plan_recipe: {
    row: (s) => ({ meal_plan_id: s.planId, recipe_id: s.recipeId, recipe_title: "Linssoppa", servings: 4, position: 0 }),
  },
  pantry_addition: { row: () => ({ key: randomUUID() }) },
  pantry_item: { row: (s) => ({ ingredient_id: s.ingredientId, location: "Kyl", amount: 1, unit: "l" }) },
  pantry_photo: {
    row: (s, ownerId) => {
      const id = randomUUID();
      return {
        id,
        site_id: s.siteId,
        location: "Kyl",
        object_path: placePhotoPath(ownerId, s.siteId, "Kyl", id, "image/jpeg"),
        media_type: "image/jpeg",
        width: 10,
        height: 10,
        taken_at: new Date().toISOString(),
        reading: [],
      };
    },
  },
  pantry_removal: { row: () => ({ id: randomUUID(), removed_rows: [] }) },
  pantry_site: { row: () => ({ name: "Stugan", normalized_name: "stugan", is_selected: true }) },
  product_choice: { row: (s) => ({ ingredient_id: s.ingredientId, store_id: s.storeId, product_name: "Arla Matlagningsgrädde 15 %" }) },
  recipe: {
    row: () => ({ title: "Krämig kycklinggryta", original_servings: 4, total_minutes: 35, source_kind: "url", source_url: "https://www.koket.se/kramig-kycklinggryta" }),
  },
  recipe_ingredient: {
    row: (s) => ({ recipe_id: s.recipeId, ingredient_id: s.ingredientId, position: 1, original_text: "1 gul lök", amount: 1, unit: "st", is_vague: false }),
  },
  recipe_site: { row: () => ({ domain: `${randomUUID()}.example.se` }) },
  recipe_step: { row: (s) => ({ recipe_id: s.recipeId, position: 1, text: "Hacka löken." }) },
  // Story 17.10: an own item and its check belong to the household, not to a plan.
  shopping_check: { row: () => ({ meal_plan_id: null, line_key: "c:11111111-1111-4111-8111-111111111111" }) },
  shopping_custom_item: { row: () => ({ meal_plan_id: null, label: "diskmedel" }) },
  shopping_line_override: {
    row: (s) => ({ meal_plan_id: s.planId, line_key: "r:11111111-1111-4111-8111-111111111111:dl", amount: 2 }),
  },
  store: { row: () => ({ name: "Coop Forum", chain: "Coop" }) },
  thing_place: { row: (s) => ({ site_id: s.siteId, room: "Skräpförrådet", part: "Översta hyllan", room_key: "skräpförrådet", part_key: "översta hyllan" }) },
  thing_photo: {
    row: (s, ownerId) => {
      const id = randomUUID();
      return {
        id,
        place_id: s.placeId,
        object_path: thingPhotoPath(ownerId, s.placeId, id, "image/jpeg"),
        media_type: "image/jpeg",
        width: 10,
        height: 10,
        taken_at: new Date().toISOString(),
      };
    },
  },
  thing_item: {
    row: (s) => ({ photo_id: s.thingPhotoId, place_id: s.placeId, name: "Hammare", category: "Verktyg", where_hint: "på väggen", confidence: "high" }),
  },
  store_offer: {
    row: (s) => ({ store_id: s.storeId, week_start: "2026-10-26", label: "Havets Laxfilé", name: "laxfilé", section: "Kött och fisk", source: "link" }),
  },
};

// Created with the tables' own parents first.
const seedOrder: IsolatedTable[] = [
  "pantry_site",
  "ingredient",
  "recipe",
  "meal_plan",
  "store",
  "ai_job",
  "ai_setting",
  "ai_usage",
  "api_key",
  "ingredient_synonym",
  "meal_plan_recipe",
  "pantry_addition",
  "pantry_item",
  "pantry_photo",
  "pantry_removal",
  "product_choice",
  "recipe_ingredient",
  "recipe_site",
  "recipe_step",
  "shopping_check",
  "shopping_custom_item",
  "shopping_line_override",
  "store_offer",
  "thing_place",
  "thing_photo",
  "thing_item",
];

/**
 * The tables of the public schema as the Data API serves them to the service
 * role (the PostgREST description lists every table and view it exposes).
 */
async function liveTables(): Promise<string[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY (pnpm db:start && pnpm db:env)");
  const response = await fetch(`${localSupabaseUrl()}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Could not read the schema: ${response.status}`);
  const description = (await response.json()) as { definitions?: Record<string, unknown> };
  return Object.keys(description.definitions ?? {}).sort();
}

let a: TestUser;
let b: TestUser;
let rowIds: Map<IsolatedTable, string>;
let aSeed: Seed;
const photoPath = (userId: string, id: string) => `${userId}/${randomUUID()}/kyl/${id}.png`;
let aPhotoPaths: Map<string, string>;
const photoBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

/** Gives `owner` a row in every table; returns the row ids and the parents they point at. */
async function seedAs(owner: Db, ownerId: string): Promise<{ ids: Map<IsolatedTable, string>; seed: Seed }> {
  const seed = {} as Seed;
  const ids = new Map<IsolatedTable, string>();
  for (const table of seedOrder) {
    const inserted = await owner
      .from(table)
      .insert(coverage[table].row(seed, ownerId) as never)
      .select("id")
      .single();
    expect(inserted.error, `A inserts ${table}`).toBeNull();
    const row = inserted.data as unknown as { id: string };
    ids.set(table, row.id);
    if (table === "pantry_site") seed.siteId = row.id;
    if (table === "ingredient") seed.ingredientId = row.id;
    if (table === "recipe") seed.recipeId = row.id;
    if (table === "meal_plan") seed.planId = row.id;
    if (table === "store") seed.storeId = row.id;
    if (table === "thing_place") seed.placeId = row.id;
    if (table === "thing_photo") seed.thingPhotoId = row.id;
  }
  return { ids, seed };
}

beforeAll(async () => {
  a = await createTestUser("household-a");
  b = await createTestUser("household-b");
  ({ ids: rowIds, seed: aSeed } = await seedAs(a.db, a.id));
  // B has data of their own too, so an empty result is not just an empty account.
  await seedAs(b.db, b.id);
  aPhotoPaths = new Map();
  for (const bucket of buckets) {
    const path = photoPath(a.id, randomUUID());
    aPhotoPaths.set(bucket, path);
    const uploaded = await a.db.storage.from(bucket).upload(path, photoBytes, { contentType: "image/png" });
    expect(uploaded.error, `A uploads a photo to ${bucket}`).toBeNull();
  }
});

afterAll(async () => {
  for (const bucket of buckets) await adminClient().storage.from(bucket).remove([aPhotoPaths.get(bucket)!]);
  await deleteTestUsers();
});

async function adminRows(table: TableName, userId: string) {
  const { data, error } = await adminClient().from(table).select("*").eq("user_id", userId).order("id");
  if (error) throw error;
  return data;
}

describe("household isolation", () => {
  it("covers every table in the public schema", async () => {
    const live = await liveTables();
    const covered = Object.keys(coverage).sort();
    const missing = live.filter((table) => !covered.includes(table) && !coveredInFeedbackTest.includes(table));
    const gone = [...covered, ...coveredInFeedbackTest].filter((table) => !live.includes(table));
    expect(missing, `tables without isolation coverage in household-isolation.test.ts: ${missing.join(", ")}`).toEqual([]);
    expect(gone, `covered tables that no longer exist: ${gone.join(", ")}`).toEqual([]);
    expect([...seedOrder].sort(), "seedOrder lists exactly the covered tables").toEqual(covered);
  });

  it("gives A a row in every table", () => {
    for (const table of seedOrder) expect(rowIds.get(table), table).toBeTruthy();
  });

  describe.each(seedOrder)("%s", (table) => {
    it("keeps A's rows from B and from anon", async () => {
      const id = rowIds.get(table)!;
      const beforeA = await adminRows(table, a.id);
      expect(beforeA.length, "A has rows").toBeGreaterThan(0);
      const beforeB = await adminRows(table, b.id);

      // A reads their own row, so the empty answers below mean something.
      expect((await a.db.from(table).select("id").eq("id", id)).data, "A reads own").toHaveLength(1);

      const spoof = { ...coverage[table].row(aSeed, a.id), user_id: a.id };

      // Another signed-in user: an empty result or a refusal, never A's data.
      const reads = await b.db.from(table).select("*").eq("id", id);
      expect(reads.error ? [] : reads.data, "B reads A's row").toEqual([]);
      const lists = await b.db.from(table).select("*").eq("user_id", a.id);
      expect(lists.error ? [] : lists.data, "B lists A's rows").toEqual([]);
      const everything = await b.db.from(table).select("user_id");
      expect(everything.data?.some((row) => (row as { user_id: string }).user_id === a.id) ?? false, "B's unfiltered read has A's rows").toBe(false);

      const update = await b.db.from(table).update({ created_at: "2000-01-01T00:00:00Z" } as never).eq("id", id).select("id");
      expect(update.error ? [] : update.data, "B updates A's row").toEqual([]);
      const reassign = await b.db.from(table).update({ user_id: b.id } as never).eq("id", id).select("id");
      expect(reassign.error ? [] : reassign.data, "B takes A's row over").toEqual([]);
      const remove = await b.db.from(table).delete().eq("id", id).select("id");
      expect(remove.error ? [] : remove.data, "B deletes A's row").toEqual([]);
      const insert = await b.db.from(table).insert(spoof as never).select("id");
      expect(insert.error?.code, "B inserts a row as A").toBe("42501");

      // Anonymous: refused outright.
      const anon = anonClient();
      expect((await anon.from(table).select("id").eq("id", id)).error?.code, "anon reads").toBe("42501");
      expect((await anon.from(table).insert(spoof as never)).error?.code, "anon inserts as A").toBe("42501");
      expect((await anon.from(table).update({ created_at: "2000-01-01T00:00:00Z" } as never).eq("id", id)).error?.code, "anon updates").toBe("42501");
      expect((await anon.from(table).delete().eq("id", id)).error?.code, "anon deletes").toBe("42501");

      // Nothing changed behind RLS: A's rows and B's are exactly as they were.
      expect(await adminRows(table, a.id), "A's rows unchanged").toEqual(beforeA);
      expect(await adminRows(table, b.id), "B's rows unchanged").toEqual(beforeB);
    });
  });

  describe.each(buckets)("storage bucket %s", (bucket) => {
    it("keeps A's photo from B and from anon", async () => {
      const aPhotoPath = aPhotoPaths.get(bucket)!;
      const admin = adminClient().storage.from(bucket);
      const original = await admin.download(aPhotoPath);
      expect(original.error, "the photo is stored").toBeNull();
      const folder = aPhotoPath.split("/").slice(0, 1).join("/");

      // A reads their own photo, so the refusals below mean something.
      expect((await a.db.storage.from(bucket).download(aPhotoPath)).error, "A reads own").toBeNull();

      for (const [who, db] of [["B", b.db], ["anon", anonClient()]] as const) {
        const files = db.storage.from(bucket);
        const listed = await files.list(folder);
        expect(listed.error ? [] : listed.data, `${who} lists A's folder`).toEqual([]);
        expect((await files.download(aPhotoPath)).error, `${who} downloads A's photo`).not.toBeNull();
        expect((await files.createSignedUrl(aPhotoPath, 60)).error, `${who} signs A's photo`).not.toBeNull();
        const removed = await files.remove([aPhotoPath]);
        expect(removed.error ? [] : removed.data, `${who} removes A's photo`).toEqual([]);
        expect((await files.upload(aPhotoPath, photoBytes, { contentType: "image/png", upsert: true })).error, `${who} overwrites A's photo`).not.toBeNull();
        expect(
          (await files.upload(photoPath(a.id, randomUUID()), photoBytes, { contentType: "image/png" })).error,
          `${who} uploads into A's folder`,
        ).not.toBeNull();
        expect((await files.move(aPhotoPath, photoPath(b.id, randomUUID()))).error, `${who} moves A's photo`).not.toBeNull();
        expect((await files.copy(aPhotoPath, photoPath(b.id, randomUUID()))).error, `${who} copies A's photo`).not.toBeNull();
      }

      // The photo is still there and unchanged, and nothing new is in A's folder.
      const after = await admin.download(aPhotoPath);
      expect(after.error, "the photo is still stored").toBeNull();
      expect(new Uint8Array(await after.data!.arrayBuffer())).toEqual(photoBytes);
      const files = await admin.list(folder, { limit: 100 });
      expect(files.data?.map((entry) => entry.name).length, "A's folder holds only A's own upload").toBe(1);
      const bFolder = await admin.list(b.id, { limit: 100 });
      expect(bFolder.data ?? [], "B's folder is empty").toEqual([]);
    });
  });

  // Story 18.13: a thing written into a box has no card (photo_id null, source manual); it is a thing_item
  // row like any other and RLS (user_id) covers it, and so do the functions that save and search it.
  describe("a thing written into a box (no card)", () => {
    it("keeps A's written thing from B and from anon, in the table and in the functions", async () => {
      const box = await a.db.from("thing_place").insert({ site_id: aSeed.siteId, room: "Garaget", part: "Black box", room_key: "garaget", part_key: "box:black box" }).select("id").single();
      expect(box.error, "A makes a box").toBeNull();
      const saved = await a.db.rpc("replace_box_things", { box: box.data!.id, things: [{ name: "Julgransbelysning", category: "Elektronik" }] });
      expect(saved.error, "A writes into it").toBeNull();
      expect(saved.data).toBe(1);
      const written = await adminClient().from("thing_item").select("*").eq("place_id", box.data!.id);
      expect(written.data).toHaveLength(1);
      const id = written.data![0].id;
      expect(written.data![0]).toMatchObject({ user_id: a.id, photo_id: null, source: "manual" });
      const before = JSON.stringify(written.data);

      // B reads, lists, changes and deletes nothing, writes nothing into A's box, and finds nothing.
      expect((await b.db.from("thing_item").select("id").eq("id", id)).data).toEqual([]);
      expect((await b.db.from("thing_item").update({ name: "Tagen" }).eq("id", id).select("id")).data).toEqual([]);
      expect((await b.db.from("thing_item").delete().eq("id", id).select("id")).data).toEqual([]);
      expect((await b.db.from("thing_item").insert({ place_id: box.data!.id, name: "Spökpryl", category: "Övrigt", confidence: "high", source: "manual", photo_id: null, user_id: a.id }).select("id")).error?.code).toBe("42501");
      expect((await b.db.rpc("replace_box_things", { box: box.data!.id, things: [] })).error?.code).toBe("MK440");
      expect((await b.db.rpc("search_things", { terms: ["julgransbelysning"] })).data).toEqual([]);
      expect((await b.db.rpc("thing_room_written", { site: aSeed.siteId, in_room: "garaget" })).data).toEqual([]);
      expect((await b.db.rpc("thing_unseen_by_room")).data?.some((row) => row.site_id === aSeed.siteId) ?? false).toBe(false);
      // A finds it.
      expect((await a.db.rpc("search_things", { terms: ["julgransbelysning"] })).data?.map((row) => row.name)).toEqual(["Julgransbelysning"]);

      // Anonymous: refused outright.
      const anon = anonClient();
      expect((await anon.from("thing_item").select("id").eq("id", id)).error?.code).toBe("42501");
      for (const [name, args] of [
        ["replace_box_things", { box: box.data!.id, things: [] }],
        ["search_things", { terms: ["julgransbelysning"] }],
        ["thing_room_written", { site: aSeed.siteId, in_room: "garaget" }],
        ["thing_unseen_by_room", {}],
      ] as const) {
        expect((await anon.rpc(name, args as never)).error?.code, `anon calls ${name}`).toBe("42501");
      }

      expect(JSON.stringify((await adminClient().from("thing_item").select("*").eq("place_id", box.data!.id)).data), "A's written thing unchanged").toBe(before);
    });
  });

  // Story 18.15: a thing added to a card (source 'added'), and clearing a room or a boende's Förråd. The
  // functions are security invoker under the caller's lock, so another user can neither count nor clear.
  describe("things added to a card and the clearing of Förråd", () => {
    it("keeps A's rooms and cards from B's clearing, B's counting and anon", async () => {
      const place = await a.db.from("thing_place").insert({ site_id: aSeed.siteId, room: "Vinden", part: null, room_key: "vinden", part_key: "" }).select("id").single();
      expect(place.error, "A makes a place").toBeNull();
      const photoId = randomUUID();
      const photo = await a.db
        .from("thing_photo")
        .insert({ id: photoId, place_id: place.data!.id, object_path: `${a.id}/${place.data!.id}/${photoId}.png`, media_type: "image/png", width: 10, height: 10, taken_at: new Date().toISOString(), status: "done" })
        .select("id")
        .single();
      expect(photo.error, "A has a finished card").toBeNull();
      expect((await a.db.rpc("add_card_things", { photo: photoId, things: [{ name: "Skiftnyckel", category: "Verktyg" }] })).data).toBe(1);
      const before = JSON.stringify((await adminClient().from("thing_item").select("*").eq("photo_id", photoId)).data);
      expect(before).toContain('"source":"added"');

      // B adds to nothing of A's, counts nothing and clears nothing.
      expect((await b.db.rpc("add_card_things", { photo: photoId, things: [{ name: "Spökpryl", category: "Övrigt" }] })).error?.code).toBe("MK440");
      expect((await b.db.rpc("thing_clear_counts", { site: aSeed.siteId, in_room: "vinden" })).data).toEqual([{ things: 0, cards: 0, boxes: 0 }]);
      expect((await b.db.rpc("clear_things", { site: aSeed.siteId, in_room: "vinden" })).error?.code).toBe("MK440");
      expect((await b.db.rpc("clear_things", { site: aSeed.siteId })).error?.code).toBe("MK440");
      // Story 18.16: B cannot rename, merge, count or remove A's rooms and places either.
      expect((await b.db.rpc("rename_thing_room", { site: aSeed.siteId, in_room: "vinden", new_name: "Hackat", new_key: "hackat" })).error?.code).toBe("MK440");
      expect((await b.db.rpc("remove_thing_place", { place: place.data!.id })).error?.code).toBe("MK440");
      expect((await b.db.rpc("thing_place_counts", { site: aSeed.siteId, in_room: "vinden" })).data).toEqual([]);
      expect((await b.db.rpc("thing_room_merge_moves", { site: aSeed.siteId, in_room: "vinden", new_key: "x" })).data).toEqual([]);
      // A thing typed onto A's card cannot be inserted by B either.
      expect((await b.db.from("thing_item").insert({ user_id: a.id, photo_id: photoId, place_id: place.data!.id, name: "Spökpryl", category: "Övrigt", confidence: "high", source: "added" })).error?.code).toBe("42501");

      const anon = anonClient();
      for (const [name, args] of [
        ["add_card_things", { photo: photoId, things: [] }],
        ["thing_clear_counts", { site: aSeed.siteId }],
        ["clear_things", { site: aSeed.siteId }],
        ["rename_thing_room", { site: aSeed.siteId, in_room: "vinden", new_name: "X", new_key: "x" }],
        ["remove_thing_place", { place: place.data!.id }],
        ["thing_place_counts", { site: aSeed.siteId, in_room: "vinden" }],
        ["thing_room_merge_moves", { site: aSeed.siteId, in_room: "vinden", new_key: "x" }],
      ] as const) {
        expect((await anon.rpc(name, args as never)).error?.code, `anon calls ${name}`).toBe("42501");
      }

      expect(JSON.stringify((await adminClient().from("thing_item").select("*").eq("photo_id", photoId)).data), "A's added thing unchanged").toBe(before);
      expect((await adminClient().from("thing_photo").select("id").eq("id", photoId)).data, "A's card is still there").toHaveLength(1);
      // A clears the room; A's own rows go.
      expect((await a.db.rpc("clear_things", { site: aSeed.siteId, in_room: "vinden" })).data).toMatchObject({ things: 1, cards: 1, boxes: 0, paths: [`${a.id}/${place.data!.id}/${photoId}.png`] });
      expect((await adminClient().from("thing_photo").select("id").eq("id", photoId)).data).toEqual([]);
    });
  });

  // Story 18.19: a thing written in with where it is (source noted, no card) is a thing_item row like any
  // other: RLS (user_id) keeps it, remember_thing writes only into the caller's own part, and the search and
  // the room's list never show it to another household.
  describe("a thing written in with where it is (noted)", () => {
    it("keeps A's noted thing from B and from anon, in the table and in the functions", async () => {
      const part = await a.db.from("thing_place").insert({ site_id: aSeed.siteId, room: "Sovrummet", part: "Byrån", room_key: "sovrummet", part_key: "byrån" }).select("id").single();
      expect(part.error).toBeNull();
      const saved = await a.db.rpc("remember_thing", { place: part.data!.id, thing_name: "Pass", thing_category: "Övrigt" });
      expect(saved.error).toBeNull();
      const id = saved.data!;
      // B can neither read, find, list, change nor remove it, nor write into A's part or remove it by `replaces`.
      expect((await b.db.from("thing_item").select("id").eq("id", id)).data).toEqual([]);
      expect((await b.db.rpc("search_things", { terms: ["pass"] })).data).toEqual([]);
      expect((await b.db.rpc("thing_room_things", { site: aSeed.siteId, in_room: "sovrummet", wanted: "Övrigt" })).data).toEqual([]);
      expect((await b.db.from("thing_item").update({ name: "Hackat" }).eq("id", id).select("id")).data).toEqual([]);
      expect((await b.db.from("thing_item").delete().eq("id", id).select("id")).data).toEqual([]);
      expect((await b.db.rpc("remember_thing", { place: part.data!.id, thing_name: "Lapp", thing_category: "Övrigt" })).error?.code).toBe("MK440");
      const bSite = await b.db.from("pantry_site").insert({ name: "B noterat", normalized_name: `b-noterat-${randomUUID()}`, is_selected: false }).select("id").single();
      expect(bSite.error).toBeNull();
      const bPart = await b.db.from("thing_place").insert({ site_id: bSite.data!.id, room: "Hallen", room_key: "hallen" }).select("id").single();
      expect((await b.db.rpc("remember_thing", { place: bPart.data!.id, thing_name: "Pass", thing_category: "Övrigt", replaces: id })).error).toBeNull();
      const insert = await b.db.from("thing_item").insert({ photo_id: null, place_id: part.data!.id, name: "Lapp", category: "Övrigt", confidence: "high", source: "noted" });
      expect(insert.error).not.toBeNull();
      expect((await adminClient().from("thing_item").select("name, user_id, source").eq("id", id).single()).data).toEqual({ name: "Pass", user_id: a.id, source: "noted" });
      // A finds it, as noted.
      expect((await a.db.rpc("search_things", { terms: ["pass"] })).data?.map((row) => [row.name, row.noted])).toEqual([["Pass", true]]);
      const anon = anonClient();
      expect((await anon.rpc("remember_thing", { place: part.data!.id, thing_name: "X", thing_category: "Övrigt" })).error?.code).toBe("42501");
      expect((await anon.from("thing_item").select("id").eq("id", id)).data ?? []).toEqual([]);
    });
  });

  // Story 17.9: a personal key for the quick-add API. The owner lists and revokes their keys and never reads
  // the hash back; a key adds only to its own household; a refused key says nothing about which keys exist.
  describe("personal keys for quick add", () => {
    const hashOf = (key: string) => sha256(key);
    const makeKey = async (user: TestUser) => {
      const key = `lk_${randomUUID()}`;
      const made = await user.db.from("api_key").insert({ key_hash: hashOf(key), label: "Siri" });
      expect(made.error, "creates a key").toBeNull();
      return key;
    };
    // Sorted: the rows have no order of their own, and other tests add to the same lists.
    const own = async (user: TestUser) =>
      ((await adminClient().from("shopping_custom_item").select("label").eq("user_id", user.id)).data?.map((row) => row.label) ?? []).sort();

    it("never lets the hash be read back, by the owner, by B or by anon", async () => {
      expect((await a.db.from("api_key").select("key_hash")).error?.code).toBe("42501");
      expect((await a.db.from("api_key").select("*")).error?.code).toBe("42501");
      expect((await b.db.from("api_key").select("key_hash")).error?.code).toBe("42501");
      expect((await anonClient().from("api_key").select("id")).error?.code).toBe("42501");
      expect((await a.db.from("api_key").select("id, label, created_at, last_used_at, revoked_at")).error).toBeNull();
      expect((await a.db.from("api_key").update({ key_hash: sha256("other") }).eq("user_id", a.id)).error?.code, "the hash cannot be changed").toBe("42501");
    });

    it("lets a key add only to its own household, and B neither see nor revoke A's key", async () => {
      const keyA = await makeKey(a);
      const keyB = await makeKey(b);
      const beforeA = await own(a);
      const beforeB = await own(b);
      const added = await anonClient().rpc("add_items_by_api_key", { hash: hashOf(keyA), labels: ["Mjölk", "Ägg"] });
      expect(added.error).toBeNull();
      expect(added.data).toEqual(["Mjölk", "Ägg"]);
      expect(await own(a)).toEqual([...beforeA, "Mjölk", "Ägg"].sort());
      expect(await own(b), "B's list is untouched").toEqual(beforeB);
      const rowA = (await adminClient().from("shopping_custom_item").select("user_id, meal_plan_id").eq("label", "Ägg").eq("user_id", a.id)).data![0];
      expect(rowA).toEqual({ user_id: a.id, meal_plan_id: null });

      await anonClient().rpc("add_items_by_api_key", { hash: hashOf(keyB), labels: ["Smör"] });
      expect(await own(b)).toContain("Smör");
      expect(await own(a)).not.toContain("Smör");

      // B sees none of A's keys and revokes none.
      const aKeys = (await adminClient().from("api_key").select("id, last_used_at").eq("user_id", a.id)).data!;
      expect(aKeys.some((row) => row.last_used_at), "use is recorded").toBe(true);
      expect((await b.db.from("api_key").select("id").eq("user_id", a.id)).data).toEqual([]);
      const revoke = await b.db.from("api_key").update({ revoked_at: new Date().toISOString() }).eq("id", aKeys[0]!.id).select("id");
      expect(revoke.error ? [] : revoke.data).toEqual([]);
      expect((await adminClient().from("api_key").select("revoked_at").eq("user_id", a.id)).data!.every((row) => row.revoked_at === null)).toBe(true);
    });

    it("refuses an unknown and a revoked key in the same way, and a revoked key adds nothing", async () => {
      const key = await makeKey(a);
      const before = await own(a);
      const unknown = await anonClient().rpc("add_items_by_api_key", { hash: hashOf("lk_nej"), labels: ["Spöke"] });
      expect((await a.db.from("api_key").update({ revoked_at: new Date().toISOString() }).eq("user_id", a.id).select("id")).error).toBeNull();
      const revoked = await anonClient().rpc("add_items_by_api_key", { hash: hashOf(key), labels: ["Spöke"] });
      expect(unknown.error).toMatchObject({ code: "MK401", message: "invalid key" });
      expect(revoked.error).toMatchObject({ code: "MK401", message: "invalid key" });
      expect(await own(a)).toEqual(before);
    });

    it("limits a key to 30 calls a minute and checks the labels", async () => {
      const user = await createTestUser("household-key-limit");
      const key = await makeKey(user);
      const db = anonClient();
      expect((await db.rpc("add_items_by_api_key", { hash: hashOf(key), labels: [] })).data, "an empty list is a probe that counts as a call").toEqual([]);
      expect((await db.rpc("add_items_by_api_key", { hash: hashOf("lk_nej"), labels: [] })).error?.code, "a probe of an unknown key").toBe("MK401");
      expect((await db.rpc("add_items_by_api_key", { hash: hashOf(key), labels: Array(21).fill("x") })).error?.code).toBe("22023");
      expect((await db.rpc("add_items_by_api_key", { hash: hashOf(key), labels: ["x".repeat(201)] })).error?.code).toBe("22023");
      expect((await db.rpc("add_items_by_api_key", { hash: hashOf(key), labels: [" "] })).error?.code).toBe("22023");
      // The validation errors above cost nothing; the probe counted as call 1, so 29 more pass and the 31st does not.
      for (let call = 0; call < 29; call++) {
        expect((await db.rpc("add_items_by_api_key", { hash: hashOf(key), labels: [`vara ${call}`] })).error, `call ${call + 1}`).toBeNull();
      }
      expect((await db.rpc("add_items_by_api_key", { hash: hashOf(key), labels: ["för mycket"] })).error?.code).toBe("MK429");
      expect(await own(user)).not.toContain("För mycket");
    });

    it("keeps a revoked key revoked, caps key rows at 50 and items at 200 a day", async () => {
      const user = await createTestUser("household-key-hardening");
      const key = await makeKey(user);
      const revoked = await user.db.from("api_key").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id).select("id");
      expect(revoked.error).toBeNull();
      const undo = await user.db.from("api_key").update({ revoked_at: null }).eq("user_id", user.id);
      expect(undo.error?.code, "revocation cannot be undone").toBe("MK404");
      const later = await user.db.from("api_key").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id);
      expect(later.error?.code, "nor changed").toBe("MK404");
      expect((await anonClient().rpc("add_items_by_api_key", { hash: hashOf(key), labels: ["x"] })).error?.code).toBe("MK401");

      // 50 rows in all: with 1 revoked, 49 more can be made (revoking each), the next is refused.
      for (let count = 1; count < 50; count++) {
        const key2 = await makeKey(user);
        void key2;
        expect((await user.db.from("api_key").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id).is("revoked_at", null)).error).toBeNull();
      }
      expect((await user.db.from("api_key").insert({ key_hash: hashOf(randomUUID()), label: "Siri" })).error?.code).toBe("MK403");

      // 200 items a day for one key: spread over calls of 20, the 11th call is refused and adds nothing.
      const other = await createTestUser("household-key-daily");
      const dayKey = await makeKey(other);
      const db = anonClient();
      for (let call = 0; call < 10; call++) {
        const labels = Array.from({ length: 20 }, (_, index) => `d${call}-${index}`);
        expect((await db.rpc("add_items_by_api_key", { hash: hashOf(dayKey), labels })).error, `call ${call + 1}`).toBeNull();
        // Keep under the minute limit's 30 calls: the window is per minute, 10 calls fit.
      }
      expect((await db.rpc("add_items_by_api_key", { hash: hashOf(dayKey), labels: ["en till"] })).error?.code).toBe("MK429");
      expect(await own(other)).toHaveLength(200);
    });

    it("allows five working keys at most", async () => {
      const user = await createTestUser("household-key-count");
      for (let count = 0; count < 5; count++) await makeKey(user);
      const sixth = await user.db.from("api_key").insert({ key_hash: hashOf(randomUUID()), label: "Siri" });
      expect(sixth.error?.code).toBe("MK402");
    });
  });
});

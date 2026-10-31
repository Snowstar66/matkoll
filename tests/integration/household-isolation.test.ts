import { randomUUID } from "node:crypto";
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

// One entry per table in the public schema. Typed by the generated types, so a
// new table is a type error here too; the live schema check below is the one
// that names it even when the types were not regenerated.
const coverage: Record<TableName, Coverage> = {
  ai_setting: { row: () => ({ provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" }) },
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
  shopping_check: { row: (s) => ({ meal_plan_id: s.planId, line_key: "r:11111111-1111-4111-8111-111111111111:dl" }) },
  shopping_custom_item: { row: (s) => ({ meal_plan_id: s.planId, label: "diskmedel" }) },
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
const seedOrder: TableName[] = [
  "pantry_site",
  "ingredient",
  "recipe",
  "meal_plan",
  "store",
  "ai_job",
  "ai_setting",
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
let rowIds: Map<TableName, string>;
let aSeed: Seed;
const photoPath = (userId: string, id: string) => `${userId}/${randomUUID()}/kyl/${id}.png`;
let aPhotoPaths: Map<string, string>;
const photoBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

/** Gives `owner` a row in every table; returns the row ids and the parents they point at. */
async function seedAs(owner: Db, ownerId: string): Promise<{ ids: Map<TableName, string>; seed: Seed }> {
  const seed = {} as Seed;
  const ids = new Map<TableName, string>();
  for (const table of seedOrder) {
    const inserted = await owner
      .from(table)
      .insert(coverage[table].row(seed, ownerId) as never)
      .select("*")
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
    const missing = live.filter((table) => !covered.includes(table));
    const gone = covered.filter((table) => !live.includes(table));
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
});

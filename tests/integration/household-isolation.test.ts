import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placePhotoBucket, placePhotoPath } from "@/features/pantry/domain/place-photo";
import { saveAiSettingIn } from "@/features/settings/data/ai-setting";
import { thingPhotoBucket, thingPhotoPath } from "@/features/things/domain/thing-photo";
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUsers,
  householdOf,
  localSql,
  moveToHousehold,
  type Db,
  type TableName,
  type TestUser,
} from "./support";

// Household isolation (Story 17.1, AD-4, NFR-11; Story 21.2a): household A has
// two members (a and a2), household B one (b). A's members share every row of
// the app's data and every photo, whoever made it; B can neither read,
// change, delete nor insert into A, in every table of the public schema,
// through the functions and in the photo buckets (the pantry's and, Epic 18,
// the things'); anon reaches nothing. The tables come from the live schema
// (information_schema and pg_policies), not from a list kept here: a table
// that a migration adds and this file does not cover fails the first test by
// name. Each table's own policies are also tried one by one in its feature's
// test; this file is the one place that checks all of them against the same
// data.

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
  thingItemId: string;
};

type Coverage = {
  /** A row for the table as `owner`; foreign keys come from `seed`. */
  row: (seed: Seed, ownerId: string) => Record<string, unknown>;
};

// Story 20.3: tables that are not one user's own. The owner of a feedback row may
// not read it back (only the app's owner may), and app_owner has no user at all;
// tests/integration/feedback.test.ts covers both, with the same intruders.
const coveredInFeedbackTest = ["app_owner", "feedback"];

// Story 21.2a: the household itself, its members and its invitations. Covered
// below in "the household and its members". Story 21.2b: the count of wrong
// invitation codes, which no client reads or writes (household-members.test.ts).
const householdTables = ["household", "household_code_attempt", "household_invite", "household_member"];

// Story 21.2a: the tables that stay a person's own, not the household's: a
// co-member sees none of their rows. Every other covered table is the
// household's (household_id, and policies on my_household_id()).
const personalTables: readonly IsolatedTable[] = ["api_key", "welcome_tour"];

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
  // Story 18.23: one change of a föremål's count (the history behind "Ta" and "Fyll på").
  thing_change: { row: (s) => ({ item_id: s.thingItemId, kind: "set", quantity_after: 5 }) },
  store_offer: {
    row: (s) => ({ store_id: s.storeId, week_start: "2026-10-26", label: "Havets Laxfilé", name: "laxfilé", section: "Kött och fisk", source: "link" }),
  },
  // Story 20.1: one row per user, the time the welcome tour was closed.
  welcome_tour: { row: () => ({ tour_seen_at: new Date().toISOString() }) },
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
  "thing_change",
  "welcome_tour",
];

type LiveTable = { name: string; has_household: boolean; rls: boolean };
type LivePolicy = { tablename: string; policyname: string; cmd: string; permissive: string; roles: string; qual: string; with_check: string };

/** Every table of the public schema, read from the catalog: whether it has household_id and RLS. */
function liveTables(): LiveTable[] {
  return localSql<LiveTable>(`
    select t.table_name as name,
      exists (select 1 from information_schema.columns c
              where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'household_id') as has_household,
      (select k.relrowsecurity from pg_class k where k.oid = ('public.' || quote_ident(t.table_name))::regclass) as rls
    from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by 1`);
}

/** Every policy on the public tables and on storage.objects, as Postgres prints it. */
function livePolicies(): LivePolicy[] {
  return localSql<LivePolicy>(`
    select (case when schemaname = 'storage' then 'storage.' else '' end) || tablename as tablename, policyname, cmd, permissive,
      array_to_string(roles, ',') as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
    from pg_policies where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')
    order by 1, 2`);
}

// The exact expressions (Story 21.2a): no other condition, no `or`.
const household = "(household_id = ( SELECT my_household_id() AS my_household_id))";
const self = "(user_id = ( SELECT auth.uid() AS uid))";
const appOwner = "( SELECT is_app_owner() AS is_app_owner)";
const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const fileRule = (bucket: string) => `((bucket_id = '${bucket}'::text) AND photo_file_in_my_household(bucket_id, name))`;
const uploadRule = (bucket: string, shape: string) =>
  `((bucket_id = '${bucket}'::text) AND (name ~ '^${shape}$'::text) AND photo_folder_in_my_household(bucket_id, name))`;

/** The policies every table, and storage.objects, must have: exactly these. */
function expectedPolicies(): Omit<LivePolicy, "roles">[] {
  const rows: Omit<LivePolicy, "roles">[] = [];
  const add = (tablename: string, policyname: string, cmd: string, qual: string, with_check: string, permissive = "PERMISSIVE") =>
    rows.push({ tablename, policyname, cmd, permissive, qual, with_check });
  for (const table of householdData()) {
    if (table === "thing_change") continue;
    add(table, `${table}_household_rows`, "ALL", household, household);
    add(table, `${table}_insert_as_self`, "INSERT", "", self, "RESTRICTIVE");
  }
  add("thing_change", "thing_change_select", "SELECT", household, "");
  add("thing_change", "thing_change_insert", "INSERT", "", `(${household} AND ${self})`);
  add("thing_change", "thing_change_delete", "DELETE", household, "");
  for (const table of personalTables) add(table, `${table}_own_rows`, "ALL", self, self);
  add("feedback", "feedback_insert_own", "INSERT", "", self);
  add("feedback", "feedback_owner_reads", "SELECT", appOwner, "");
  add("feedback", "feedback_owner_marks_read", "UPDATE", appOwner, appOwner);
  add("household", "household_member_reads", "SELECT", "(id = ( SELECT my_household_id() AS my_household_id))", "");
  add("household_member", "household_member_reads", "SELECT", household, "");
  for (const [bucket, prefix, shape] of [
    [placePhotoBucket, "pantry_photo", `${uuidPattern}/${uuidPattern}/(kyl|frys|skafferi)/${uuidPattern}\\.(jpg|png)`],
    [thingPhotoBucket, "thing_photo", `${uuidPattern}/${uuidPattern}/${uuidPattern}\\.(jpg|png)`],
  ]) {
    add("storage.objects", `${prefix}_select`, "SELECT", fileRule(bucket), "");
    add("storage.objects", `${prefix}_insert`, "INSERT", "", uploadRule(bucket, shape));
    add("storage.objects", `${prefix}_delete`, "DELETE", fileRule(bucket), "");
  }
  const key = (row: { tablename: string; policyname: string }) => `${row.tablename} ${row.policyname}`;
  return rows.sort((x, y) => key(x).localeCompare(key(y)));
}

/** The tables authenticated may update (A's co-member changes A's rows there). */
function updatableTables(): Set<string> {
  return new Set(
    localSql<{ name: string }>(`
      select table_name as name from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'`).map((row) => row.name),
  );
}

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;
let householdB: string;
let canUpdate: Set<string>;
let rowIds: Map<IsolatedTable, string>;
let aSeed: Seed;
let bSeed: Seed;
/** A photo's path in `bucket`, under `place` (a pantry_site for pantry-photo, a thing_place for thing-photo). */
const photoPath = (bucket: string, userId: string, place: string, id: string = randomUUID()) =>
  bucket === placePhotoBucket ? `${userId}/${place}/kyl/${id}.png` : `${userId}/${place}/${id}.png`;
const placeOf = (bucket: string) => (bucket === placePhotoBucket ? aSeed.siteId : aSeed.placeId);
let aPhotoPaths: Map<string, string>;
/** A's second member's own photo in each bucket, in a2's folder. */
let a2PhotoPaths: Map<string, string>;
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
    if (table === "thing_item") seed.thingItemId = row.id;
  }
  return { ids, seed };
}

beforeAll(async () => {
  a = await createTestUser("household-a");
  a2 = await createTestUser("household-a2");
  b = await createTestUser("household-b");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
  // a2 joins A's household (Story 21.2b's invitation, done here with the service role).
  await moveToHousehold(a2, householdA);
  canUpdate = updatableTables();
  ({ ids: rowIds, seed: aSeed } = await seedAs(a.db, a.id));
  // B has data of their own too, so an empty result is not just an empty account.
  ({ seed: bSeed } = await seedAs(b.db, b.id));
  aPhotoPaths = new Map();
  a2PhotoPaths = new Map();
  for (const bucket of buckets) {
    const path = photoPath(bucket, a.id, placeOf(bucket));
    aPhotoPaths.set(bucket, path);
    const uploaded = await a.db.storage.from(bucket).upload(path, photoBytes, { contentType: "image/png" });
    expect(uploaded.error, `A uploads a photo to ${bucket}`).toBeNull();
    const own = photoPath(bucket, a2.id, placeOf(bucket));
    a2PhotoPaths.set(bucket, own);
    expect((await a2.db.storage.from(bucket).upload(own, photoBytes, { contentType: "image/png" })).error, `a2 uploads to ${bucket}`).toBeNull();
  }
});

afterAll(async () => {
  for (const bucket of buckets) await adminClient().storage.from(bucket).remove([aPhotoPaths.get(bucket)!, a2PhotoPaths.get(bucket)!]);
  // Household A holds rows a2 made that point at a's (a recipe line on a's ingredient). Deleting a's
  // account cascades only a's own rows (user_id), which those rows hold back (on delete restrict),
  // so the household goes first, with all its rows. Story 21.2b: see docs/molnet.md, risks.
  const dropped = await adminClient().from("household").delete().eq("id", householdA);
  expect(dropped.error, "household A is deleted").toBeNull();
  await deleteTestUsers();
});

async function adminRows(table: TableName, userId: string) {
  const { data, error } = await adminClient().from(table).select("*").eq("user_id", userId).order("id");
  if (error) throw error;
  return data;
}

const householdData = (): IsolatedTable[] => seedOrder.filter((table) => !personalTables.includes(table));

/** Every row of `household` in every table of the app's data, read with the service role. */
async function householdSnapshot(household: string): Promise<string> {
  const tables: Record<string, unknown> = {};
  for (const table of householdData()) {
    const { data, error } = await adminClient().from(table).select("*").eq("household_id" as never, household as never).order("id");
    if (error) throw error;
    tables[table] = data;
  }
  return JSON.stringify(tables);
}

describe("household isolation", () => {
  it("covers every table in the public schema", () => {
    const tables = liveTables();
    const live = tables.map((table) => table.name);
    const covered = Object.keys(coverage).sort();
    const known = [...covered, ...coveredInFeedbackTest, ...householdTables];
    const missing = live.filter((table) => !known.includes(table));
    const gone = known.filter((table) => !live.includes(table));
    expect(missing, `tables without isolation coverage in household-isolation.test.ts: ${missing.join(", ")}`).toEqual([]);
    expect(gone, `covered tables that no longer exist: ${gone.join(", ")}`).toEqual([]);
    expect([...seedOrder].sort(), "seedOrder lists exactly the covered tables").toEqual(covered);
    expect(tables.filter((table) => !table.rls).map((table) => table.name), "every table has RLS").toEqual([]);
    // Story 21.2a: every table of the app's data is the household's, and only those.
    const shared = householdData();
    for (const table of tables) {
      const isShared = (shared as string[]).includes(table.name);
      if (isShared) expect(table.has_household, `${table.name} has household_id`).toBe(true);
      else if (!["household_member", "household_invite"].includes(table.name)) {
        expect(table.has_household, `${table.name} is a person's (or the app's), without household_id`).toBe(false);
      }
    }
  });

  it("has exactly the expected policies on every table and on storage.objects, for authenticated only", () => {
    const live = livePolicies();
    expect(live.filter((row) => row.roles !== "authenticated").map((row) => `${row.tablename} ${row.policyname}`), "policies for another role").toEqual([]);
    const key = (row: { tablename: string; policyname: string }) => `${row.tablename} ${row.policyname}`;
    const actual = live.map(({ roles, ...row }) => (void roles, row)).sort((x, y) => key(x).localeCompare(key(y)));
    expect(actual).toEqual(expectedPolicies());
  });

  it("puts a and a2 in household A and b in household B", async () => {
    expect(householdA).not.toBe(householdB);
    expect(await householdOf(a2.id)).toBe(householdA);
    for (const [who, user, household] of [["a", a, householdA], ["a2", a2, householdA], ["b", b, householdB]] as const) {
      expect((await user.db.rpc("my_household_id")).data, `${who}'s household`).toBe(household);
    }
    expect((await a2.db.rpc("is_household_member", { hid: householdA })).data).toBe(true);
    expect((await b.db.rpc("is_household_member", { hid: householdA })).data).toBe(false);
    expect((await anonClient().rpc("my_household_id")).error?.code).toBe("42501");
    expect((await anonClient().rpc("is_household_member", { hid: householdA })).error?.code).toBe("42501");
  });

  it("gives A a row in every table", () => {
    for (const table of seedOrder) expect(rowIds.get(table), table).toBeTruthy();
  });

  describe.each(seedOrder)("%s", (table) => {
    const personal = personalTables.includes(table);

    it(personal ? "is a's own: a2 in the same household sees none of it" : "is shared by A's members", async () => {
      const id = rowIds.get(table)!;
      const read = await a2.db.from(table).select("id").eq("id", id);
      if (personal) {
        expect(read.error ? [] : read.data, "a2 reads a's row").toEqual([]);
        return;
      }
      expect(read.data, "a2 reads a's row").toHaveLength(1);
      if (canUpdate.has(table)) {
        // An update that changes nothing: a2 may change a's row.
        const { data: row } = await adminClient().from(table).select("created_at").eq("id", id).single();
        const update = await a2.db.from(table).update({ created_at: (row as { created_at: string }).created_at } as never).eq("id", id).select("id");
        expect(update.error, "a2 updates a's row").toBeNull();
        expect(update.data, "a2 updates a's row").toHaveLength(1);
      }
      // The row stays household A's, made by a.
      const { data } = await adminClient().from(table).select("household_id, user_id").eq("id", id).single();
      expect(data, "a's row is household A's").toEqual({ household_id: householdA, user_id: a.id });
    });

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
      if (!personal) {
        // Story 21.2a: nor as themselves into A's household, nor in B's household pointing at A's rows.
        const intoA = await b.db.from(table).insert({ ...coverage[table].row(aSeed, b.id), household_id: householdA } as never).select("id");
        expect(intoA.error?.code, "B inserts into A's household").toBe("42501");
        const everythingB = await b.db.from(table).select("*");
        expect(
          everythingB.data?.some((row) => (row as { household_id?: string }).household_id === householdA) ?? false,
          "B's unfiltered read has A's household's rows",
        ).toBe(false);
        const pointing = coverage[table].row(aSeed, b.id);
        const pointsAtA = JSON.stringify(pointing).match(/[0-9a-f-]{36}/g)?.some((value) => Object.values(aSeed).includes(value)) ?? false;
        if (pointsAtA) {
          const refused = await b.db.from(table).insert(pointing as never).select("id");
          expect(refused.error, "B's row pointing at A's rows is refused").not.toBeNull();
        }
      }

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
      // Story 21.2a: A's members share the photos, in either's folder.
      const a2Path = a2PhotoPaths.get(bucket)!;
      expect((await a2.db.storage.from(bucket).download(aPhotoPath)).error, "a2 reads a's photo").toBeNull();
      expect((await a.db.storage.from(bucket).download(a2Path)).error, "a reads a2's photo").toBeNull();
      expect((await a2.db.storage.from(bucket).list(folder)).data?.length, "a2 lists a's folder").toBe(1);

      for (const [who, db] of [["B", b.db], ["anon", anonClient()]] as const) {
        const files = db.storage.from(bucket);
        expect((await files.download(a2Path)).error, `${who} downloads a2's photo`).not.toBeNull();
        expect((await files.list(a2Path.split("/")[0])).data ?? [], `${who} lists a2's folder`).toEqual([]);
        const listed = await files.list(folder);
        expect(listed.error ? [] : listed.data, `${who} lists A's folder`).toEqual([]);
        expect((await files.download(aPhotoPath)).error, `${who} downloads A's photo`).not.toBeNull();
        expect((await files.createSignedUrl(aPhotoPath, 60)).error, `${who} signs A's photo`).not.toBeNull();
        const removed = await files.remove([aPhotoPath]);
        expect(removed.error ? [] : removed.data, `${who} removes A's photo`).toEqual([]);
        expect((await files.upload(aPhotoPath, photoBytes, { contentType: "image/png", upsert: true })).error, `${who} overwrites A's photo`).not.toBeNull();
        expect(
          (await files.upload(photoPath(bucket, a.id, placeOf(bucket)), photoBytes, { contentType: "image/png" })).error,
          `${who} uploads into A's folder`,
        ).not.toBeNull();
        expect((await files.move(aPhotoPath, photoPath(bucket, b.id, randomUUID()))).error, `${who} moves A's photo`).not.toBeNull();
        expect((await files.copy(aPhotoPath, photoPath(bucket, b.id, randomUUID()))).error, `${who} copies A's photo`).not.toBeNull();
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
  // Story 18.23: the count of a föremål and its history are changed only through functions that check the caller.
  describe("the count of a föremål (Ta och fyll på)", () => {
    it("keeps A's count and history from B and from anon, in the table and in the functions", async () => {
      const itemId = rowIds.get("thing_item")!;
      const set = await a.db.rpc("set_thing_quantity", { item: itemId, amount: 5 });
      expect(set.error).toBeNull();
      const took = await a.db.rpc("change_thing_quantity", { item: itemId, delta: -2 });
      expect(took.error).toBeNull();
      const changeId = took.data![0].change_id;
      const itemBefore = JSON.stringify((await adminClient().from("thing_item").select("*").eq("id", itemId)).data);
      const historyBefore = JSON.stringify((await adminClient().from("thing_change").select("*").eq("item_id", itemId).order("id")).data);

      // B neither sees nor changes A's count or history, and every function says the föremål is not found.
      expect((await b.db.from("thing_change").select("id").eq("item_id", itemId)).data).toEqual([]);
      expect((await b.db.from("thing_item").select("quantity").eq("id", itemId)).data).toEqual([]);
      expect((await b.db.rpc("change_thing_quantity", { item: itemId, delta: -1 })).error?.code).toBe("MK440");
      expect((await b.db.rpc("change_thing_quantity", { item: itemId, delta: 3 })).error?.code).toBe("MK440");
      expect((await b.db.rpc("set_thing_quantity", { item: itemId, amount: 99 })).error?.code).toBe("MK440");
      expect((await b.db.rpc("undo_thing_change", { change: changeId })).error?.code).toBe("MK440");
      expect((await b.db.rpc("stop_thing_count", { item: itemId })).error?.code).toBe("MK440");
      expect((await b.db.rpc("restore_thing_count", { item: itemId, amount: 1, changes: [] })).error?.code).toBe("MK440");
      // Nor writes a change onto A's föremål as B: the foreign key holds the user too.
      expect((await b.db.from("thing_change").insert({ item_id: itemId, kind: "set", quantity_after: 1 })).error).not.toBeNull();
      expect((await b.db.from("thing_change").update({ quantity_after: 1 }).eq("id", changeId).select("id")).data ?? []).toEqual([]);
      expect((await b.db.rpc("search_things", { terms: ["hammare"] })).data?.some((row) => row.id === itemId) ?? false).toBe(false);

      // Anon reaches none of it.
      const anon = anonClient();
      for (const [name, args] of [
        ["change_thing_quantity", { item: itemId, delta: -1 }],
        ["set_thing_quantity", { item: itemId, amount: 1 }],
        ["undo_thing_change", { change: changeId }],
        ["stop_thing_count", { item: itemId }],
        ["restore_thing_count", { item: itemId, amount: 1, changes: [] }],
      ] as const) {
        expect((await anon.rpc(name, args as never)).error?.code, `anon ${name}`).toBe("42501");
      }

      // A's count and history are exactly as they were.
      expect(JSON.stringify((await adminClient().from("thing_item").select("*").eq("id", itemId)).data)).toBe(itemBefore);
      expect(JSON.stringify((await adminClient().from("thing_change").select("*").eq("item_id", itemId).order("id")).data)).toBe(historyBefore);
    });
  });

  // Story 21.2a: A's members work on each other's rows, through the tables and the functions.
  describe("A's members together", () => {
    it("point at each other's rows, find each other's things and merge a room with the other's card", async () => {
      const step = await a2.db.from("recipe_ingredient").insert({ recipe_id: aSeed.recipeId, ingredient_id: aSeed.ingredientId, position: 90, original_text: "lite lök", is_vague: true }).select("household_id, user_id").single();
      expect(step.error, "a2 adds a line to a's recipe with a's ingredient").toBeNull();
      expect(step.data).toEqual({ household_id: householdA, user_id: a2.id });

      const from = await a.db.from("thing_place").insert({ site_id: aSeed.siteId, room: "Garaget", part: null, room_key: "garaget", part_key: "" }).select("id").single();
      const to = await a.db.from("thing_place").insert({ site_id: aSeed.siteId, room: "Boden", part: null, room_key: "boden", part_key: "" }).select("id").single();
      expect(from.error ?? to.error).toBeNull();
      const cardId = randomUUID();
      const oldPath = `${a.id}/${from.data!.id}/${cardId}.png`;
      expect((await a.db.storage.from(thingPhotoBucket).upload(oldPath, photoBytes, { contentType: "image/png" })).error).toBeNull();
      // Only the shape `<folder>/<place>/<id>.(jpg|png)`, and never under another household's place.
      expect((await a.db.storage.from(thingPhotoBucket).upload(`${a.id}/${from.data!.id}/extra/${cardId}.png`, photoBytes, { contentType: "image/png" })).error).not.toBeNull();
      expect((await a.db.storage.from(thingPhotoBucket).upload(`${a.id}/${bSeed.placeId}/${cardId}.png`, photoBytes, { contentType: "image/png" })).error).not.toBeNull();
      expect((await a.db.from("thing_photo").insert({ id: cardId, place_id: from.data!.id, object_path: oldPath, media_type: "image/png", width: 10, height: 10, taken_at: new Date().toISOString(), status: "done" })).error).toBeNull();
      expect((await a.db.rpc("add_card_things", { photo: cardId, things: [{ name: "Vinterdäck", category: "Övrigt" }] })).data).toBe(1);
      expect((await a2.db.rpc("search_things", { terms: ["vinterdäck"] })).data?.map((row) => row.name), "a2 finds a's thing").toEqual(["Vinterdäck"]);
      // The household's one AI choice: a2 replaces the one a saved, which keeps its maker.
      await saveAiSettingIn(a.db, { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" });
      await saveAiSettingIn(a2.db, { provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" });
      expect((await adminClient().from("ai_setting").select("model, user_id").eq("household_id", householdA)).data).toEqual([{ model: "claude-sonnet-5-5", user_id: a.id }]);

      // a2 merges a's room into another; the card keeps a's folder, and a2 may copy the file there.
      const renamed = await a2.db.rpc("rename_thing_room", { site: aSeed.siteId, in_room: "garaget", new_name: "Boden", new_key: "boden" });
      expect(renamed.error, "a2 merges a's room").toBeNull();
      const newPath = `${a.id}/${to.data!.id}/${cardId}.png`;
      expect((renamed.data as { moves: { from: string; to: string }[] }).moves).toEqual([{ from: oldPath, to: newPath }]);
      expect((await a2.db.storage.from(thingPhotoBucket).copy(oldPath, newPath)).error, "a2 copies a's file in a's folder").toBeNull();
      expect((await a2.db.storage.from(thingPhotoBucket).remove([oldPath])).data, "a2 removes the old one").toHaveLength(1);
      expect((await adminClient().from("thing_photo").select("object_path, user_id").eq("id", cardId).single()).data).toEqual({ object_path: newPath, user_id: a.id });
      expect((await a.db.storage.from(thingPhotoBucket).download(newPath)).error, "a reads the moved file").toBeNull();
      // B neither reads nor lists it.
      expect((await b.db.storage.from(thingPhotoBucket).download(newPath)).error).not.toBeNull();
      expect((await a.db.rpc("clear_things", { site: aSeed.siteId, in_room: "boden" })).error).toBeNull();
      await adminClient().storage.from(thingPhotoBucket).remove([newPath]);
    });
  });

  // Story 21.2a: the household, its members and its invitations. Members read
  // their own household and who is in it; nobody writes them directly (21.2b's
  // functions will), and no one reads an invitation.
  describe("the household and its members", () => {
    it("lets A's members read household A and its members, and B neither", async () => {
      for (const user of [a, a2]) {
        expect((await user.db.from("household").select("id")).data?.map((row) => row.id)).toEqual([householdA]);
        const members = (await user.db.from("household_member").select("user_id, household_id, role")).data ?? [];
        expect(members.map((row) => row.user_id).sort()).toEqual([a.id, a2.id].sort());
        expect(members.every((row) => row.household_id === householdA)).toBe(true);
      }
      expect((await b.db.from("household").select("id")).data?.map((row) => row.id)).toEqual([householdB]);
      expect((await b.db.from("household").select("id").eq("id", householdA)).data).toEqual([]);
      expect((await b.db.from("household_member").select("user_id")).data?.map((row) => row.user_id)).toEqual([b.id]);
      expect((await b.db.from("household_member").select("user_id").eq("household_id", householdA)).data).toEqual([]);
    });

    it("refuses every direct write, to members and to B, and anon everything", async () => {
      const before = JSON.stringify([
        (await adminClient().from("household").select("*").in("id", [householdA, householdB]).order("id")).data,
        (await adminClient().from("household_member").select("*").in("household_id", [householdA, householdB]).order("user_id")).data,
      ]);
      for (const [who, db] of [["a", a.db], ["b", b.db], ["anon", anonClient()]] as const) {
        expect((await db.from("household").insert({ name: "Nytt" })).error?.code, `${who} makes a household`).toBe("42501");
        expect((await db.from("household").update({ name: "Kapat" }).eq("id", householdA)).error?.code, `${who} renames A`).toBe("42501");
        expect((await db.from("household").delete().eq("id", householdA)).error?.code, `${who} deletes A`).toBe("42501");
        expect(
          (await db.from("household_member").insert({ household_id: householdA, user_id: b.id, role: "member", display_name: "Inkräktare", color: "sand" })).error?.code,
          `${who} joins A`,
        ).toBe("42501");
        expect((await db.from("household_member").update({ household_id: householdA }).eq("user_id", b.id)).error?.code, `${who} moves b into A`).toBe("42501");
        expect((await db.from("household_member").update({ role: "owner" }).eq("user_id", a2.id)).error?.code, `${who} makes a2 owner`).toBe("42501");
        expect((await db.from("household_member").delete().eq("user_id", a2.id)).error?.code, `${who} removes a2`).toBe("42501");
        expect((await db.from("household_invite").select("id")).error?.code, `${who} reads invitations`).toBe("42501");
        expect(
          (await db.from("household_invite").insert({ code_hash: sha256(randomUUID()), household_id: householdA, expires_at: new Date(Date.now() + 86_400_000).toISOString() })).error?.code,
          `${who} makes an invitation`,
        ).toBe("42501");
      }
      expect((await anonClient().from("household").select("id")).error?.code).toBe("42501");
      expect((await anonClient().from("household_member").select("user_id")).error?.code).toBe("42501");
      const after = JSON.stringify([
        (await adminClient().from("household").select("*").in("id", [householdA, householdB]).order("id")).data,
        (await adminClient().from("household_member").select("*").in("household_id", [householdA, householdB]).order("user_id")).data,
      ]);
      expect(after, "households and members unchanged").toBe(before);
    });
  });

  // Story 21.2a: the functions signed-in users may call, read from pg_proc. Each
  // one is called by B with A's ids here, or tried in a describe above, or is
  // listed as one that takes no other household's ids (it works on the
  // caller's own household, or on nothing stored).
  describe("the functions with A's ids", () => {
    const triedAbove = [
      "add_card_things", "add_items_by_api_key", "change_thing_quantity", "clear_things", "remember_thing", "remove_thing_place",
      "rename_thing_room", "replace_box_things", "restore_thing_count", "search_things", "set_thing_quantity", "stop_thing_count",
      "thing_clear_counts", "thing_place_counts", "thing_room_merge_moves", "thing_room_things", "thing_room_written",
      "thing_unseen_by_room", "undo_thing_change", "my_household_id", "is_household_member",
      // Story 21.2b: tried with A's ids below ("the household's functions") and in household-members.test.ts.
      "revoke_household_invite", "restore_household_invite", "remove_household_member", "make_household_owner",
      "accept_household_invite", "household_invite_preview",
    ];
    const ownHouseholdOnly = [
      // Locks, defaults and sweeps of the caller's own household, and reads without arguments.
      "ai_job_expire", "ai_job_lock", "meal_plan_lock", "pantry_lock", "store_lock", "meal_plan_close_past", "ensure_pantry_defaults",
      "ensure_user_defaults", "pantry_photo_orphans", "pantry_site_item_counts", "pantry_session_site", "ai_usage_month",
      "clear_other_store_offers", "enqueue_ai_job", "commit_ingredients", "is_app_owner",
      // Story 21.2b: the caller's own household and name (household-members.test.ts tries each).
      "create_household_invite", "household_invites", "household_members", "leave_household", "rename_household", "set_my_display_name",
      // Pure functions of their arguments.
      "catalog_display_name", "meal_plan_week_start", "pantry_added_time", "pantry_photo_points_valid", "pantry_photo_reading_valid",
    ];

    /** What B is calling, with A's ids. */
    function calls(): [string, Record<string, unknown>][] {
      const plan = rowIds.get("meal_plan")!;
      const dish = rowIds.get("meal_plan_recipe")!;
      const site = aSeed.siteId;
      const job = rowIds.get("ai_job")!;
      const item = rowIds.get("shopping_custom_item")!;
      const lineKey = "r:11111111-1111-4111-8111-111111111111:dl";
      const photoId = aSeed.thingPhotoId;
      return [
        ["delete_meal_plan", { plan_id: plan }],
        ["copy_meal_plan", { source_plan: plan, target_week: "2030-01-07" }],
        ["set_current_meal_plan", { new_plan_id: randomUUID(), plan_name: "Kapat", source_id: plan }],
        ["add_to_current_plan", { dish_id: randomUUID(), dish_recipe_id: aSeed.recipeId, dish_recipe_title: "Kapat", dish_servings: 2, plan_name: "Kapat" }],
        ["add_to_plan", { week_start: "2030-01-07", dish_id: randomUUID(), dish_recipe_id: aSeed.recipeId, dish_recipe_title: "Kapat", dish_servings: 2, plan_name: "Kapat" }],
        ["restore_plan_recipe", { dish: { id: randomUUID(), meal_plan_id: plan, recipe_id: aSeed.recipeId, recipe_title: "Kapat", servings: 2, position: 0 } }],
        ["detach_recipe_from_current_plan", { detached_recipe_id: aSeed.recipeId }],
        ["mark_dish_cooked", { dish, site, deductions: [] }],
        ["undo_dish_cooked", { dish }],
        ["save_recipe", { recipe: { title: "Kapat", original_servings: 2, source_kind: "url", source_url: "https://www.koket.se/kapat" }, steps: [], lines: [{ position: 1, original_text: "lök", ingredient_id: aSeed.ingredientId, is_vague: true }] }],
        ["update_recipe", { id: aSeed.recipeId, expected_updated_at: new Date().toISOString(), recipe: { title: "Kapat" }, steps: [], lines: [] }],
        ["select_pantry_site", { site_id: site }],
        ["delete_pantry_site", { site_id: site }],
        ["save_pantry_site", { site_id: site, site_name: "Kapat", site_normalized_name: "kapat", mode: "rename" }],
        ["pantry_target_site", { site }],
        ["pantry_selected_site", { owner: a.id }],
        ["pantry_owner_lock", { owner: a.id }],
        ["pantry_place_has_item", { ingredient: aSeed.ingredientId, place: "Kyl", item_unit: "l", site }],
        ["select_store", { store_id: aSeed.storeId }],
        ["save_store", { store: { id: aSeed.storeId, name: "Kapat", chain: "ICA" }, mode: "update", make_selected: true }],
        ["save_store_offers", { store: aSeed.storeId, week: "2026-10-26", items: [] }],
        ["save_product_choice", { choice: { ingredient_id: aSeed.ingredientId, store_id: aSeed.storeId, product_name: "Kapat" }, expected_id: null, expected_updated_at: null }],
        ["cancel_ai_job", { job_id: job }],
        ["dismiss_ai_job", { job_id: job }],
        ["mark_ai_job_seen", { job_id: job }],
        ["claim_ai_job", { job_id: job, run_deadline: new Date(Date.now() + 60_000).toISOString() }],
        ["finish_ai_job", { job_id: job, job_status: "done", job_result: {} }],
        ["set_ai_job_result", { job_id: job, job_result: {} }],
        ["set_shopping_check", { plan_id: plan, line_key: lineKey, checked: true }],
        ["hide_shopping_line", { plan_id: plan, line_key: lineKey }],
        ["show_shopping_line", { plan_id: plan, line_key: lineKey }],
        ["restore_shopping_line", { plan_id: plan, line_key: lineKey, previous: { id: rowIds.get("shopping_line_override")!, amount: 1, hidden: false } }],
        ["set_shopping_line_amount", { plan_id: plan, line_key: lineKey, amount: 9 }],
        ["add_shopping_custom_item", { item: { id: randomUUID(), meal_plan_id: plan, label: "Kapat", ingredient_id: aSeed.ingredientId } }],
        ["remove_shopping_custom_item", { item_id: item }],
        ["update_shopping_custom_item", { item: { id: item, label: "Kapat" } }],
        ["clear_put_in_pantry", { plan_id: plan, check_ids: [rowIds.get("shopping_check")!], override_keys: [lineKey], custom_item_ids: [item] }],
        ["restore_pantry_removal", { operation_id: rowIds.get("pantry_removal")! }],
        ["restore_pantry_item", { item: { id: rowIds.get("pantry_item")!, ingredient_id: aSeed.ingredientId, location: "Kyl", amount: 1, unit: "l", site_id: site }, site }],
        ["empty_pantry_place", { place: "Kyl", operation_id: randomUUID(), site }],
        ["set_pantry_items", { items: [], replace_id: rowIds.get("pantry_item")!, site }],
        ["add_to_pantry", { items: [{ key: randomUUID(), ingredient_id: aSeed.ingredientId, location: "Kyl", amount: 1, unit: "l" }], site }],
        ["apply_pantry_inventory", { place: "Kyl", items: [], replace_ids: [], remove_ids: [rowIds.get("pantry_item")!], operation_id: randomUUID(), site }],
        ["save_pantry_photo", { site, place: "Kyl", photo_id: randomUUID(), photo_path: `${b.id}/${site}/kyl/${randomUUID()}.png`, photo_type: "image/png", photo_width: 10, photo_height: 10, photo_taken_at: new Date().toISOString(), photo_reading: [] }],
        ["set_pantry_photo_points", { photo_id: rowIds.get("pantry_photo")!, photo_points: [] }],
        ["delete_expired_pantry_photos", { photo_ids: [rowIds.get("pantry_photo")!], taken_before: "2100-01-01T00:00:00Z" }],
        ["save_thing_card", { photo: photoId, things: [], note: null, hidden_count: 0 }],
        ["save_thing_reading", { photo: photoId, things: [], note: null, hidden_count: 0 }],
        ["merge_thing_items", { photo: photoId, pairs: [] }],
        // Story 21.3: a history with a maker of A's household is refused on A's föremål.
        ["put_thing_changes", { item: aSeed.thingItemId, changes: [{ kind: "set", quantity_after: 1, user_id: a.id }] }],
        ["relink_thing_items", { links: [{ item: aSeed.thingItemId, same_as: null }] }],
        ["thing_room_categories", { site, in_room: "skräpförrådet" }],
        ["thing_room_stats", { site }],
        ["photo_file_in_my_household", { bucket: placePhotoBucket, object_name: aPhotoPaths.get(placePhotoBucket)! }],
        ["photo_folder_in_my_household", { bucket: thingPhotoBucket, object_name: photoPath(thingPhotoBucket, a.id, aSeed.placeId) }],
      ];
    }

    /** Nothing of A's: an empty answer, a refusal, or "gone". */
    const nothing = (value: unknown): boolean =>
      value === null || value === undefined || value === false || value === 0 || value === "" || value === "gone" || value === "missing" ||
      (Array.isArray(value) && value.every(nothing)) ||
      (typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every(nothing));

    it("covers every function authenticated may call", () => {
      const granted = localSql<{ name: string }>(`
        select distinct p.proname as name from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        order by 1`).map((row) => row.name);
      const known = [...calls().map(([name]) => name), ...triedAbove, ...ownHouseholdOnly];
      expect(granted.filter((name) => !known.includes(name)), "functions without isolation coverage").toEqual([]);
      expect(known.filter((name) => !granted.includes(name)), "covered functions that are gone").toEqual([]);
    });

    it("give B nothing of A's, change nothing of A's, and refuse anon", async () => {
      const beforeA = await householdSnapshot(householdA);
      const aIds = new Set<string>([householdA, ...(beforeA.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [])]);
      // The makers' ids are users, not rows; the fixed line key's uuid is not A's either.
      for (const id of [a.id, a2.id, "11111111-1111-4111-8111-111111111111"]) aIds.delete(id);
      for (const [name, args] of calls()) {
        const result = await b.db.rpc(name as never, args as never);
        // A wrong name or argument list would make the call prove nothing.
        expect(["PGRST202", "42883"], `${name} is called with its real arguments`).not.toContain(result.error?.code);
        const answer = JSON.stringify(result.data ?? null);
        expect([...aIds].filter((id) => answer.includes(id)), `${name} gives B none of A's ids`).toEqual([]);
        expect(result.error !== null || nothing(result.data), `${name} gives B nothing: ${answer}`).toBe(true);
        expect((await anonClient().rpc(name as never, args as never)).error?.code, `anon calls ${name}`).toBe("42501");
      }
      expect(await householdSnapshot(householdA), "A's household is exactly as it was").toBe(beforeA);
      // B's household gained no row that points at one of A's.
      const bRows = await householdSnapshot(householdB);
      expect([...aIds].filter((id) => bRows.includes(id)), "B's rows that name an id of A's").toEqual([]);
    });
  });

  // Story 21.2a: who made a row and whose it is never change under RLS.
  // Story 21.2b: B tries the household's functions with A's ids and A's invitation; nothing of A's
  // changes, and B's own household and name are B's. household-members.test.ts tries each in depth.
  describe("the household's functions with A's ids", () => {
    it("give B nothing of A's and change nothing of A's", async () => {
      const made = await a.db.rpc("create_household_invite");
      expect(made.error).toBeNull();
      const invite = made.data![0]!;
      const before = JSON.stringify([
        (await adminClient().from("household").select("*").eq("id", householdA)).data,
        (await adminClient().from("household_member").select("*").eq("household_id", householdA).order("user_id")).data,
        (await adminClient().from("household_invite").select("*").eq("household_id", householdA).order("id")).data,
      ]);
      expect((await b.db.rpc("revoke_household_invite", { invite_id: invite.id })).data, "b revokes A's invitation").toBe(false);
      expect((await b.db.rpc("restore_household_invite", { invite_id: invite.id })).data).toBe(false);
      expect((await b.db.rpc("remove_household_member", { member: a2.id })).error?.code, "b removes a2").toBe("MK455");
      expect((await b.db.rpc("make_household_owner", { member: a2.id })).error?.code, "b makes a2 owner").toBe("MK455");
      expect((await b.db.rpc("household_invites")).data?.some((row) => row.id === invite.id) ?? false).toBe(false);
      expect((await b.db.rpc("household_members")).data?.map((row) => row.user_id)).toEqual([b.id]);
      expect((await b.db.rpc("rename_household", { new_name: "Kapat" })).error).toBeNull();
      expect((await b.db.rpc("set_my_display_name", { new_name: "Bertil" })).error).toBeNull();
      const after = JSON.stringify([
        (await adminClient().from("household").select("*").eq("id", householdA)).data,
        (await adminClient().from("household_member").select("*").eq("household_id", householdA).order("user_id")).data,
        (await adminClient().from("household_invite").select("*").eq("household_id", householdA).order("id")).data,
      ]);
      expect(after, "A unchanged").toBe(before);
      expect((await adminClient().from("household").select("name").eq("id", householdB).single()).data?.name).toBe("Kapat");
      const anon = anonClient();
      for (const [name, args] of [
        ["create_household_invite", {}],
        ["revoke_household_invite", { invite_id: invite.id }],
        ["restore_household_invite", { invite_id: invite.id }],
        ["household_invites", {}],
        ["household_members", {}],
        ["accept_household_invite", { code: invite.code }],
        ["leave_household", {}],
        ["remove_household_member", { member: a2.id }],
        ["make_household_owner", { member: a2.id }],
        ["rename_household", { new_name: "Kapat" }],
        ["set_my_display_name", { new_name: "Kapat" }],
      ] as const) {
        expect((await anon.rpc(name, args as never)).error?.code, `anon calls ${name}`).toBe("42501");
      }
      expect((await a.db.rpc("revoke_household_invite", { invite_id: invite.id })).data).toBe(true);
    });
  });

  describe("the maker and the household of a row", () => {
    it("are refused to a co-member and to the maker, and a photo keeps its folder", async () => {
      const recipe = aSeed.recipeId;
      for (const [who, db] of [["a2", a2.db], ["a", a.db]] as const) {
        expect((await db.from("recipe").update({ user_id: a2.id }).eq("id", recipe)).error?.code, `${who} changes the maker`).toBe("42501");
        expect((await db.from("recipe").update({ user_id: null }).eq("id", recipe)).error?.code, `${who} empties the maker`).toBe("42501");
        expect((await db.from("recipe").update({ household_id: householdB }).eq("id", recipe)).error?.code, `${who} moves the row`).toBe("42501");
      }
      const card = aSeed.thingPhotoId;
      const { data: row } = await adminClient().from("thing_photo").select("object_path, user_id").eq("id", card).single();
      const moved = row!.object_path.replace(a.id, a2.id);
      expect((await a2.db.from("thing_photo").update({ object_path: moved }).eq("id", card)).error?.code, "a2 moves a's card to a2's folder").toBe("42501");
      expect((await adminClient().from("recipe").select("user_id, household_id").eq("id", recipe).single()).data).toEqual({ user_id: a.id, household_id: householdA });
      expect((await adminClient().from("thing_photo").select("object_path, user_id").eq("id", card).single()).data).toEqual(row);
    });
  });

  // Story 21.2a: a member's account that is deleted leaves the household's rows,
  // with no maker, also rows another member's rows point at (on delete restrict).
  describe("a deleted member", () => {
    it("leaves their rows to the household with user_id null, and nothing fails", async () => {
      const a3 = await createTestUser("household-a3");
      await moveToHousehold(a3, householdA);
      const ingredient = await a3.db.from("ingredient").insert({ name: "Saffran", normalized_name: `saffran ${randomUUID()}`, section: "Frukt och grönt", location: "Skafferi", default_unit: "g" }).select("id").single();
      expect(ingredient.error).toBeNull();
      const recipe = await a3.db.from("recipe").insert({ title: "Lussebullar", original_servings: 20, source_kind: "url", source_url: "https://www.koket.se/lussebullar" }).select("id").single();
      expect(recipe.error).toBeNull();
      // a's line points at a3's ingredient (on delete restrict).
      const aLine = await a.db.from("recipe_ingredient").insert({ recipe_id: aSeed.recipeId, ingredient_id: ingredient.data!.id, position: 91, original_text: "saffran", is_vague: true }).select("id").single();
      expect(aLine.error).toBeNull();
      const cardId = randomUUID();
      const cardPath = `${a3.id}/${aSeed.placeId}/${cardId}.png`;
      expect((await a3.db.storage.from(thingPhotoBucket).upload(cardPath, photoBytes, { contentType: "image/png" })).error).toBeNull();
      expect((await a3.db.from("thing_photo").insert({ id: cardId, place_id: aSeed.placeId, object_path: cardPath, media_type: "image/png", width: 10, height: 10, taken_at: new Date().toISOString(), status: "done" })).error).toBeNull();

      const deleted = await adminClient().auth.admin.deleteUser(a3.id);
      expect(deleted.error, "the account is deleted").toBeNull();

      for (const [table, id] of [["ingredient", ingredient.data!.id], ["recipe", recipe.data!.id], ["thing_photo", cardId]] as const) {
        const { data } = await adminClient().from(table).select("user_id, household_id").eq("id", id).single();
        expect(data, `a3's ${table} stays in A without a maker`).toEqual({ user_id: null, household_id: householdA });
        expect((await a.db.from(table).select("id").eq("id", id)).data, `a reads it`).toHaveLength(1);
      }
      expect((await a.db.from("recipe_ingredient").select("id").eq("id", aLine.data!.id)).data).toHaveLength(1);
      // The card's file is the household's through its row; a may change the rows.
      expect((await a.db.storage.from(thingPhotoBucket).download(cardPath)).error, "a reads the card file").toBeNull();
      expect((await a.db.from("recipe").update({ title: "Lussebullar med saffran" }).eq("id", recipe.data!.id).select("id")).data).toHaveLength(1);
      expect((await b.db.storage.from(thingPhotoBucket).download(cardPath)).error, "B does not").not.toBeNull();
      expect((await adminClient().from("household").select("id").eq("id", householdA)).data, "household A stays").toHaveLength(1);
      await adminClient().storage.from(thingPhotoBucket).remove([cardPath]);
      await adminClient().from("thing_photo").delete().eq("id", cardId);
    });
  });

  // Story 21.2a: a member who moves to another household (21.2b's Lämna) takes
  // nothing along: they see none of the old household's rows, and the photos
  // they took there stay the old household's, also the files in their own folder.
  describe("a member who moves to another household", () => {
    it("leaves A's rows and A's photos behind, in A", async () => {
      const placeId = aSeed.placeId;
      const cardId = randomUUID();
      const cardPath = `${a2.id}/${placeId}/${cardId}.png`;
      expect((await a2.db.storage.from(thingPhotoBucket).upload(cardPath, photoBytes, { contentType: "image/png" })).error).toBeNull();
      const card = await a2.db
        .from("thing_photo")
        .insert({ id: cardId, place_id: placeId, object_path: cardPath, media_type: "image/png", width: 10, height: 10, taken_at: new Date().toISOString(), status: "done" });
      expect(card.error, "a2 adds a card to a's place").toBeNull();
      expect((await a.db.storage.from(thingPhotoBucket).download(cardPath)).error, "a reads a2's card file").toBeNull();

      // A card row whose file is not there (yet): after the move, its path is not a2's to fill.
      const pendingId = randomUUID();
      const pendingPath = `${a2.id}/${placeId}/${pendingId}.png`;
      expect((await a2.db.from("thing_photo").insert({ id: pendingId, place_id: placeId, object_path: pendingPath, media_type: "image/png", width: 10, height: 10, taken_at: new Date().toISOString(), status: "done" })).error).toBeNull();

      const { data: moved, error } = await adminClient().from("household").insert({ name: "Tredje hushållet" }).select("id").single();
      expect(error).toBeNull();
      await moveToHousehold(a2, moved!.id, "owner");
      expect((await a2.db.rpc("my_household_id")).data).toBe(moved!.id);

      for (const table of householdData()) {
        const read = await a2.db.from(table).select("id").eq("id", rowIds.get(table)!);
        expect(read.error ? [] : read.data, `a2 reads A's ${table} after moving`).toEqual([]);
      }
      expect((await a2.db.from("thing_photo").select("id").eq("id", cardId)).data, "a2's own card stays in A").toEqual([]);
      const files = a2.db.storage.from(thingPhotoBucket);
      expect((await files.download(cardPath)).error, "a2 reads the card file in their own folder").not.toBeNull();
      expect((await files.list(`${a2.id}/${placeId}`)).data ?? [], "a2 lists it").toEqual([]);
      expect((await files.remove([cardPath])).data ?? [], "a2 removes it").toEqual([]);
      expect((await a2.db.storage.from(placePhotoBucket).download(aPhotoPaths.get(placePhotoBucket)!)).error, "a2 reads a's photo").not.toBeNull();
      // A's leftover files in a2's folder (no row, under A's places): neither a2 nor a2's new household reads or removes them.
      for (const bucket of buckets) {
        const leftover = a2PhotoPaths.get(bucket)!;
        const own = a2.db.storage.from(bucket);
        expect((await own.download(leftover)).error, `a2 reads A's leftover file in ${bucket}`).not.toBeNull();
        expect((await own.remove([leftover])).data ?? [], `a2 removes it`).toEqual([]);
        expect((await own.list(leftover.split("/").slice(0, 2).join("/"))).data ?? [], `a2 lists it`).toEqual([]);
        expect((await adminClient().storage.from(bucket).download(leftover)).error, "it is still there").toBeNull();
      }
      // Nor uploads at a path a row of A's points at.
      expect((await files.upload(pendingPath, photoBytes, { contentType: "image/png" })).error, "a2 fills A's card").not.toBeNull();
      // A keeps it: the row points at it.
      expect((await a.db.storage.from(thingPhotoBucket).download(cardPath)).error, "a still reads the card file").toBeNull();
      expect((await a.db.from("thing_photo").select("user_id").eq("id", cardId)).data).toEqual([{ user_id: a2.id }]);
      await adminClient().storage.from(thingPhotoBucket).remove([cardPath]);
      expect((await adminClient().storage.from(thingPhotoBucket).download(pendingPath)).error, "nothing was uploaded there").not.toBeNull();
    });
  });
});

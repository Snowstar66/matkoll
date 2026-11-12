import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUsers,
  householdOf,
  localSql,
  moveToHousehold,
  type Db,
  type TestUser,
} from "./support";

// Attack tests (security audit). Two real signed-in users in two different
// households, and an anonymous client, try to cross the household boundary.
// household-isolation.test.ts proves it table by table with hand-written rows
// (and every function, and the photo buckets); this file is the independent,
// catalog-driven layer on top of it, so a mistake in one list cannot hide a hole:
//
//   1. Catalog audit: grants, views, function privileges, SECURITY DEFINER bodies, buckets.
//      A new table, function or bucket that this file has not classified FAILS the audit.
//   2. A generic attack on EVERY table found in the database, needing no per-table row recipe.
//   3. The photo buckets, attacked more broadly than in household-isolation.test.ts.
//   4. The invitation and join flow.
//   5. What anon can see through PostgREST's schema and GraphQL.
//
// Known holes would be written as `it.fails(...)` with a `SECURITY: known hole, see S-xx`
// comment; there are none at the time of writing.

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// The explicit exception lists. Anything not here and not household- or
// user-scoped fails the audit, so nobody can add a table and forget RLS.
// ---------------------------------------------------------------------------

/**
 * Tables with neither household_id nor user_id as the owner, that are
 * deliberately global, one-off or reachable by no client. Each needs a reason.
 */
const intentionallyNotScoped: Record<string, string> = {
  ingredient_nutrition:
    "Shared reference data (nutrition per ingredient name): no owner. authenticated may SELECT, nobody may write, anon nothing (nutrition.test.ts).",
  app_owner: "One row naming the app's owner (no user column to scope by). No client grant; read only through is_app_owner() (feedback.test.ts).",
  app_invite: "The owner's allow list of invited addresses. RLS on, no policy and no grant for any client; only the owner-gated functions touch it (app-invites.test.ts).",
  ai_cap: "The owner's one-row daily AI cost cap. RLS on, no policy and no grant for any client (ai-cap.test.ts).",
  household_code_attempt: "Counts wrong invitation codes per account or IP. No policy, no grant: only the security definer functions write it (household-members.test.ts).",
  household_invite: "Household invitations, kept as a hash. No policy, no grant: only the security definer functions touch it (household-members.test.ts).",
  push_event: "Queue of changes to push. RLS on, no policy, no grant; claimed by household in claim_push_batches (push.test.ts).",
  eat_soon_sent: "The day a household was told about food to eat soon. RLS on, no policy, no grant (eat-soon.test.ts).",
  ai_usage_reservation: "Which ai_usage rows are placeholders of a running AI call (cost cap, S-02). RLS on, no policy, no grant for any client; only the security definer functions ai_usage_reserve and ai_usage_settle touch it (ai-cap.test.ts).",
  starter_pack_item:
    "Startrecept: the app owner's pack, rows naming the owner's own recipes (no user or household of its own). RLS on, no policy, no grant for any client; only the owner-gated functions write it and the members' functions read the recipes in it (starter-recipes.test.ts).",
  household: "The household itself: its id is the household id (no household_id column). authenticated may SELECT only their own (id = my_household_id()); every write is refused (household-isolation.test.ts).",
  // Shared recipes (Delade recept) are read through list_shared_recipes()/get_shared_recipe() with explicit
  // rules; the table itself is the household's own (household_id) so it is scoped, not an exception here.
};

/** Tables whose rows are one person's (user_id) and not shared by the household. */
const personalScoped = ["api_key", "welcome_tour", "push_preference", "push_subscription", "feedback"];

/**
 * Functions anon may execute. Each takes a secret the caller must already
 * hold (an API-key hash or an invitation code) and answers only about it.
 */
const anonCallable: Record<string, string> = {
  add_items_by_api_key: "Siri/quick add: authenticates by the hash of a personal API key, writes only to that key's household, rate limited (household-isolation.test.ts).",
  household_invite_preview: "Shows an invitation to someone who holds its code, before sign-in; 50 wrong codes in 10 minutes lock it (household-members.test.ts).",
  app_invite_preview: "Same for the app-level invitation code (app-invites.test.ts).",
};

/**
 * SECURITY DEFINER functions authenticated or anon may call whose body names
 * no caller identity (auth.uid, my_household_id, ...): they authorise by a
 * secret argument instead. Anything else without an identity check is flagged.
 */
const definerWithoutIdentity: Record<string, string> = { ...anonCallable };

/** Photo buckets: every bucket in the database must be listed here (and so be attacked below). */
const buckets = ["pantry-photo", "thing-photo"];

/**
 * The bucket of the recipes' own copies of their pictures (20261112100000_recipe_images.sql): its names are
 * <household>/<recipe>/full|thumb, not a user's folder, so it has its own attack below and is listed
 * here for the audit. tests/integration/recipe-images.test.ts goes further (the cap, the column, the orphans).
 */
const recipeBucket = "recipe-images";

const identityMarker = /auth\.uid\s*\(|auth\.jwt\s*\(|auth\.role\s*\(|my_household_id\s*\(|is_app_owner\s*\(|is_household_member\s*\(|current_user|session_user/;

// ---------------------------------------------------------------------------
// Catalog queries
// ---------------------------------------------------------------------------

type Column = { table_name: string; column_name: string };
type TableInfo = { name: string; rls: boolean; columns: string[]; select: boolean; insert: boolean; update: boolean; delete: boolean; policies: number };

function liveTables(): TableInfo[] {
  const tables = localSql<{ name: string; rls: boolean; select: boolean; insert: boolean; update: boolean; delete: boolean; policies: number }>(`
    select t.table_name as name,
      k.relrowsecurity as rls,
      has_table_privilege('authenticated', k.oid, 'SELECT') as "select",
      has_table_privilege('authenticated', k.oid, 'INSERT') as "insert",
      has_table_privilege('authenticated', k.oid, 'UPDATE') as "update",
      has_table_privilege('authenticated', k.oid, 'DELETE') as "delete",
      (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name) as policies
    from information_schema.tables t
    join pg_class k on k.oid = ('public.' || quote_ident(t.table_name))::regclass
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    order by 1`);
  const columns = localSql<Column>(`
    select table_name, column_name from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`);
  return tables.map((table) => ({
    ...table,
    columns: columns.filter((column) => column.table_name === table.name).map((column) => column.column_name),
  }));
}

// ---------------------------------------------------------------------------
// 1. Catalog audit
// ---------------------------------------------------------------------------

describe("catalog audit", () => {
  it("classifies every table: household-scoped, personal, or an explicit exception", () => {
    const unclassified: string[] = [];
    for (const table of liveTables()) {
      const household = table.columns.includes("household_id");
      const personal = table.columns.includes("user_id");
      if (table.name in intentionallyNotScoped) continue;
      if (household) continue;
      if (personal && personalScoped.includes(table.name)) continue;
      unclassified.push(table.name);
    }
    expect(
      unclassified,
      `tables that are neither household-scoped (household_id), personal (listed in personalScoped) nor in intentionallyNotScoped: ${unclassified.join(", ")}. Add RLS and a household_id, or list the table with a reason in this file.`,
    ).toEqual([]);
    const live = liveTables().map((table) => table.name);
    expect(Object.keys(intentionallyNotScoped).filter((name) => !live.includes(name)), "exceptions for tables that no longer exist").toEqual([]);
    expect(personalScoped.filter((name) => !live.includes(name)), "personal tables that no longer exist").toEqual([]);
  });

  it("has RLS on every table, and a policy wherever authenticated has a grant", () => {
    for (const table of liveTables()) {
      expect(table.rls, `${table.name} has RLS`).toBe(true);
      const granted = table.select || table.insert || table.update || table.delete;
      if (granted) expect(table.policies, `${table.name} is granted to authenticated and has a policy`).toBeGreaterThan(0);
    }
  });

  it("gives anon no privilege on any table, sequence or view, and no one TRUNCATE, TRIGGER or REFERENCES", () => {
    const anon = localSql<{ what: string }>(`
      select table_name || ' ' || privilege_type as what from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'PUBLIC')`);
    expect(anon.map((row) => row.what), "anon table privileges").toEqual([]);
    const sequences = localSql<{ name: string }>(`
      select c.relname as name from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
        and (has_sequence_privilege('anon', c.oid, 'USAGE') or has_sequence_privilege('anon', c.oid, 'SELECT') or has_sequence_privilege('anon', c.oid, 'UPDATE'))`);
    // Two sequences are default-granted by Supabase; harmless: nextval() is not reachable through the API
    // and anon has no insert on their tables.
    const harmless = ["household_code_attempt_id_seq", "push_event_seq_seq"];
    expect(sequences.map((row) => row.name).filter((name) => !harmless.includes(name)), "sequences anon may use").toEqual([]);
    const dangerous = localSql<{ what: string }>(`
      select table_name || ' ' || privilege_type as what from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')`);
    expect(dangerous.map((row) => row.what), "TRUNCATE, TRIGGER or REFERENCES granted to a client role").toEqual([]);
    const schemaCreate = localSql<{ ok: boolean }>(`select has_schema_privilege('anon', 'public', 'CREATE') or has_schema_privilege('authenticated', 'public', 'CREATE') as ok`);
    expect(schemaCreate[0]!.ok, "a client role can CREATE in schema public").toBe(false);
  });

  it("has no view or materialized view in public (a view would bypass RLS unless security_invoker)", () => {
    const views = localSql<{ name: string; invoker: boolean }>(`
      select c.relname as name, coalesce(c.reloptions::text like '%security_invoker=true%', false) as invoker
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')`);
    expect(views.filter((view) => !view.invoker).map((view) => view.name), "views without security_invoker").toEqual([]);
  });

  it("lets anon call only the listed secret-holder functions (trigger functions are not callable over RPC)", () => {
    const callable = localSql<{ name: string }>(`
      select distinct p.proname as name from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
        and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))
      order by 1`);
    expect(callable.map((row) => row.name).filter((name) => !(name in anonCallable)), "functions anon (or PUBLIC) may execute without being listed").toEqual([]);
    expect(Object.keys(anonCallable).filter((name) => !callable.some((row) => row.name === name)), "listed anon functions that anon cannot call").toEqual([]);
  });

  it("gives every SECURITY DEFINER function an empty search_path and an identity check or a listed reason", () => {
    const rows = localSql<{ name: string; args: string; config: string | null; src: string; client: boolean }>(`
      select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, array_to_string(p.proconfig, ',') as config, p.prosrc as src,
        (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE')) as client
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prorettype <> 'trigger'::regtype order by 1`);
    expect(rows.length, "there are security definer functions to check").toBeGreaterThan(10);
    const noSearchPath = rows.filter((row) => !/search_path=""/.test(row.config ?? "")).map((row) => `${row.name}(${row.args})`);
    expect(noSearchPath, "SECURITY DEFINER without search_path=''").toEqual([]);
    const flagged = rows
      .filter((row) => row.client && !identityMarker.test(row.src) && !(row.name in definerWithoutIdentity))
      .map((row) => `${row.name}(${row.args})`);
    expect(
      flagged,
      `SECURITY DEFINER functions a client may call that check no caller identity (auth.uid, my_household_id, is_app_owner, ...): ${flagged.join(", ")}`,
    ).toEqual([]);
  });

  it("has only the known private buckets, each of which is attacked below", () => {
    const live = localSql<{ id: string; public: boolean }>(`select id, public from storage.buckets order by 1`);
    expect(live.filter((bucket) => bucket.public).map((bucket) => bucket.id), "public buckets").toEqual([]);
    expect(live.map((bucket) => bucket.id).sort(), "buckets without attack coverage in security-attack.test.ts").toEqual([...buckets, recipeBucket].sort());
  });
});

// ---------------------------------------------------------------------------
// 2. A generic attack on every table
// ---------------------------------------------------------------------------

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;
let householdB: string;

beforeAll(async () => {
  a = await createTestUser("sec-a");
  a2 = await createTestUser("sec-a2");
  b = await createTestUser("sec-b");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
  await moveToHousehold(a2, householdA);
});

afterAll(async () => {
  // Household A's rows may point at each other across members; deleting the household first drops them all.
  if (householdA) await adminClient().from("household").delete().eq("id", householdA);
  await deleteTestUsers();
});

/** Every row of `table` that is B's, as the service role sees it (by household_id and/or user_id). */
async function bRows(table: TableInfo): Promise<Row[]> {
  const admin = adminClient();
  const key = table.columns.includes("household_id") ? ["household_id", householdB] : table.columns.includes("user_id") ? ["user_id", b.id] : null;
  if (!key) return [];
  const { data, error } = await admin.from(table.name as never).select("*").eq(key[0] as never, key[1] as never);
  // Even the service role has no grant on a few internal tables (eat_soon_sent): nothing to compare there.
  if (error?.code === "42501") return [];
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

const sorted = (rows: Row[]) => JSON.stringify([...rows].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))));

/** A client's result is "nothing": a refusal or no rows. Anything else is a leak or a write. */
function nothing(result: { error: { code?: string } | null; data: unknown }, what: string) {
  if (result.error) {
    expect(["42501", "PGRST116"], `${what}: refused with ${JSON.stringify(result.error)}`).toContain(result.error.code);
  } else {
    expect(result.data ?? [], what).toEqual([]);
  }
}

/** The least number of tables where B must have a row, found with the generic seeding below. */
const FLOOR = 8;

describe("every table, attacked by A (household A) at B's data", () => {
  let tables: TableInfo[] = [];
  /** Tables where B really has rows, so an empty answer for A means something. */
  const withBRows: string[] = [];

  beforeAll(async () => {
    tables = liveTables();
    // Give B a row in every table where one can be made generically from the catalog: B's ids, a
    // dummy value per NOT NULL column without a default, and a row of B's for each foreign key
    // (parents first, in a few passes). Tables that refuse such a row (check constraints, enums)
    // are covered with rows built by hand in household-isolation.test.ts. Account creation already
    // gave B some default rows. The service role writes them (they are B's own data, not an attack).
    const columns = localSql<{ table_name: string; column_name: string; data_type: string }>(`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and is_nullable = 'NO' and column_default is null and is_identity = 'NO' and is_generated = 'NEVER'`);
    const foreignKeys = localSql<{ table_name: string; column_name: string; ref_table: string; ref_column: string; ref_schema: string }>(`
      select c.conrelid::regclass::text as table_name, a.attname as column_name, r.relname as ref_table, ra.attname as ref_column, rn.nspname as ref_schema
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_class r on r.oid = c.confrelid join pg_namespace rn on rn.oid = r.relnamespace
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1`);
    const dummy = (type: string): unknown =>
      type === "uuid" ? randomUUID()
      : type === "boolean" ? false
      : ["integer", "bigint", "smallint", "numeric", "double precision", "real"].includes(type) ? 1
      : type === "jsonb" || type === "json" ? {}
      : type === "ARRAY" ? []
      : type.startsWith("timestamp") ? new Date().toISOString()
      : type === "date" ? new Date().toISOString().slice(0, 10)
      : "x";
    const seeded = new Set<string>();
    for (let pass = 0; pass < 6; pass++) {
      for (const table of tables) {
        if (table.name in intentionallyNotScoped || seeded.has(table.name)) continue;
        if ((await bRows(table)).length > 0) {
          seeded.add(table.name);
          continue;
        }
        const row: Row = {};
        if (table.columns.includes("household_id")) row.household_id = householdB;
        if (table.columns.includes("user_id")) row.user_id = b.id;
        if (Object.keys(row).length === 0) continue;
        let parentsReady = true;
        for (const column of columns.filter((c) => c.table_name === table.name)) {
          if (column.column_name in row) continue;
          const fk = foreignKeys.find((f) => f.table_name === table.name && f.column_name === column.column_name);
          if (fk?.ref_schema === "auth") {
            row[column.column_name] = b.id;
          } else if (fk) {
            const parent = tables.find((t) => t.name === fk.ref_table);
            const parentRow = parent ? (await bRows(parent))[0] : undefined;
            if (!parentRow) parentsReady = false;
            else row[column.column_name] = parentRow[fk.ref_column];
          } else {
            row[column.column_name] = dummy(column.data_type);
          }
        }
        if (!parentsReady) continue;
        const made = await adminClient().from(table.name as never).insert(row as never);
        if (!made.error) seeded.add(table.name);
      }
    }
    for (const table of tables) if ((await bRows(table)).length > 0) withBRows.push(table.name);
  });

  it("has B's rows in a good share of the tables, so the attacks below are not all against empty tables", () => {
    // A floor, not an exact number: new default rows only raise it.
    expect(withBRows.length, `tables with rows of B's: ${withBRows.join(", ")}`).toBeGreaterThanOrEqual(FLOOR);
  });

  it("A reads, lists and counts none of B's rows in any table", async () => {
    for (const table of tables) {
      const all = await a.db.from(table.name as never).select("*");
      if (all.error) {
        expect(all.error.code, `${table.name}: select refused`).toBe("42501");
        continue;
      }
      for (const row of (all.data ?? []) as unknown as Row[]) {
        expect(row.household_id, `${table.name}: A sees a row of household B`).not.toBe(householdB);
        expect(row.user_id, `${table.name}: A sees a row made by B`).not.toBe(b.id);
      }
      // Counting and filtering by B's own ids says nothing either.
      for (const [column, value] of [["household_id", householdB], ["user_id", b.id]] as const) {
        if (!table.columns.includes(column)) continue;
        const filtered = await a.db.from(table.name as never).select("*", { count: "exact" }).eq(column as never, value as never);
        nothing(filtered, `${table.name}: A filters on ${column} = B`);
        expect(filtered.count ?? 0, `${table.name}: A counts B's rows by ${column}`).toBe(0);
      }
    }
  });

  it("A cannot insert, move, change or delete anything of B's in any table", async () => {
    const before = new Map<string, string>();
    for (const table of tables) before.set(table.name, sorted(await bRows(table)));
    // (A table the service role may not read has no count: both counts are then 0.)
    const countAll = async (table: TableInfo) => (await adminClient().from(table.name as never).select("*", { count: "exact", head: true })).count ?? 0;
    const totalsBefore = new Map<string, number>();
    for (const table of tables) totalsBefore.set(table.name, await countAll(table));

    for (const table of tables) {
      const name = table.name as never;
      for (const [column, value, mine] of [["household_id", householdB, householdA], ["user_id", b.id, a.id]] as const) {
        if (!table.columns.includes(column)) continue;
        // INSERT into B's household / as B: RLS WITH CHECK is evaluated before NOT NULL, so 42501, not 23502.
        const insert = await a.db.from(name).insert({ [column]: value } as never).select("*");
        expect(insert.error?.code, `${table.name}: A inserts with ${column} = B (${JSON.stringify(insert.error)})`).toBe("42501");
        // UPDATE B's rows (taking them over, and renaming their key), DELETE B's rows.
        nothing(await a.db.from(name).update({ [column]: mine } as never).eq(column as never, value as never).select("*"), `${table.name}: A takes B's rows over by ${column}`);
        nothing(await a.db.from(name).delete().eq(column as never, value as never).select("*"), `${table.name}: A deletes B's rows by ${column}`);
        // Unfiltered: A pushing every row A can reach into B's household must not work or touch B's.
        nothing(await a.db.from(name).update({ [column]: value } as never).not(column as never, "is", null).select("*"), `${table.name}: A moves all A's rows to B by ${column}`);
      }
    }

    for (const table of tables) {
      expect(sorted(await bRows(table)), `${table.name}: B's rows unchanged`).toBe(before.get(table.name));
      // Nothing was added or removed anywhere, in A's household or B's.
      expect(await countAll(table), `${table.name}: row count unchanged`).toBe(totalsBefore.get(table.name));
    }
  });

  it("anon is refused outright on every table: select, insert, update, delete", async () => {
    const anon = anonClient();
    for (const table of tables) {
      const name = table.name as never;
      expect((await anon.from(name).select("*")).error?.code, `${table.name}: anon selects`).toBe("42501");
      expect((await anon.from(name).insert({} as never)).error?.code, `${table.name}: anon inserts`).toBe("42501");
      // Not the identity column (updating it fails before the privilege check would answer).
      const column = ["created_at", "user_id", "household_id"].find((name) => table.columns.includes(name)) ?? table.columns.at(-1)!;
      const forB: Row = {};
      if (table.columns.includes("household_id")) forB.household_id = householdB;
      if (table.columns.includes("user_id")) forB.user_id = b.id;
      expect((await anon.from(name).insert(forB as never)).error?.code, `${table.name}: anon inserts for B`).toBe("42501");
      expect((await anon.from(name).update({ [column]: null } as never).not(column as never, "is", null)).error?.code, `${table.name}: anon updates`).toBe("42501");
      expect((await anon.from(name).delete().not(column as never, "is", null)).error?.code, `${table.name}: anon deletes`).toBe("42501");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The photo buckets
// ---------------------------------------------------------------------------

describe("photo buckets, B's file attacked by A and anon", () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9, 9]);
  const uploaded: Record<string, string[]> = { "pantry-photo": [], "thing-photo": [] };
  let siteB: string;
  let placeB: string;
  let siteA: string;
  let placeA: string;
  const paths: Record<string, { b: string; folderB: string; inB: (id: string) => string; inA: (id: string) => string; ownA: (id: string) => string }> = {};

  beforeAll(async () => {
    const make = async (user: TestUser) => {
      const site = await user.db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true }).select("id").single();
      expect(site.error).toBeNull();
      const place = await user.db
        .from("thing_place")
        .insert({ site_id: site.data!.id, room: "Garaget", part: null, room_key: "garaget", part_key: "" })
        .select("id")
        .single();
      expect(place.error).toBeNull();
      return [site.data!.id, place.data!.id] as const;
    };
    [siteA, placeA] = await make(a);
    [siteB, placeB] = await make(b);
    const bFile = randomUUID();
    paths["pantry-photo"] = {
      b: `${b.id}/${siteB}/kyl/${bFile}.png`,
      folderB: b.id,
      inB: (id) => `${b.id}/${siteB}/kyl/${id}.png`,
      inA: (id) => `${a.id}/${siteB}/kyl/${id}.png`, // A's folder, B's site
      ownA: (id) => `${a.id}/${siteA}/kyl/${id}.png`,
    };
    paths["thing-photo"] = {
      b: `${b.id}/${placeB}/${bFile}.png`,
      folderB: b.id,
      inB: (id) => `${b.id}/${placeB}/${id}.png`,
      inA: (id) => `${a.id}/${placeB}/${id}.png`,
      ownA: (id) => `${a.id}/${placeA}/${id}.png`,
    };
    for (const bucket of buckets) {
      const up = await b.db.storage.from(bucket).upload(paths[bucket]!.b, bytes, { contentType: "image/png" });
      expect(up.error, `B uploads to ${bucket}`).toBeNull();
      uploaded[bucket]!.push(paths[bucket]!.b);
    }
  });

  afterAll(async () => {
    for (const bucket of buckets) if (uploaded[bucket]!.length) await adminClient().storage.from(bucket).remove(uploaded[bucket]!);
  });

  const attackers = (): [string, Db][] => [["A", a.db], ["anon", anonClient()]];

  it.each(buckets)("%s: reading, listing, signing and copying B's file are refused", async (bucket) => {
    const target = paths[bucket]!;
    expect((await b.db.storage.from(bucket).download(target.b)).error, "B reads own").toBeNull();
    for (const [who, db] of attackers()) {
      const files = db.storage.from(bucket);
      expect((await files.download(target.b)).error, `${who} downloads`).not.toBeNull();
      expect((await files.createSignedUrl(target.b, 60)).error, `${who} signs`).not.toBeNull();
      const signedMany = await files.createSignedUrls([target.b], 60);
      expect((signedMany.data ?? []).every((entry) => !entry.signedUrl), `${who} bulk-signs`).toBe(true);
      const listed = await files.list(target.folderB);
      expect(listed.error ? [] : listed.data, `${who} lists B's folder`).toEqual([]);
      const listedDeep = await files.list(target.b.split("/").slice(0, 2).join("/"));
      expect(listedDeep.error ? [] : listedDeep.data, `${who} lists B's sub-folder`).toEqual([]);
      const searched = await files.list(target.folderB, { search: "png" });
      expect(searched.error ? [] : searched.data, `${who} searches B's folder`).toEqual([]);
      // Copy B's file into A's own (permitted) folder: the read side of copy must be refused.
      const copy = await files.copy(target.b, target.ownA(randomUUID()));
      expect(copy.error, `${who} copies B's file into own folder`).not.toBeNull();
      // The "public" URL of a private bucket gives nothing either.
      const pub = files.getPublicUrl(target.b).data.publicUrl;
      expect((await fetch(pub)).status, `${who} fetches the public URL`).not.toBe(200);
    }
    // And over plain HTTP with the authenticated token, through the authenticated route.
    const session = (await a.db.auth.getSession()).data.session!;
    const direct = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${target.b}`, {
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    });
    expect(direct.status, "A fetches B's file with a token over HTTP").not.toBe(200);
  });

  it.each(buckets)("%s: writing into, over or out of B's file and folder is refused", async (bucket) => {
    const target = paths[bucket]!;
    for (const [who, db] of attackers()) {
      const files = db.storage.from(bucket);
      expect((await files.upload(target.b, bytes, { contentType: "image/png", upsert: true })).error, `${who} overwrites B's file`).not.toBeNull();
      expect((await files.upload(target.inB(randomUUID()), bytes, { contentType: "image/png" })).error, `${who} adds a file to B's folder`).not.toBeNull();
      expect((await files.upload(target.inA(randomUUID()), bytes, { contentType: "image/png" })).error, `${who} uploads into own folder under B's site or place`).not.toBeNull();
      expect((await files.createSignedUploadUrl(target.b, { upsert: true })).error, `${who} gets an upload URL for B's file`).not.toBeNull();
      expect((await files.createSignedUploadUrl(target.inB(randomUUID()))).error, `${who} gets an upload URL into B's folder`).not.toBeNull();
      expect((await files.move(target.b, target.ownA(randomUUID()))).error, `${who} moves B's file away`).not.toBeNull();
      expect((await files.move(target.b, target.inB(randomUUID()))).error, `${who} renames B's file`).not.toBeNull();
      const removed = await files.remove([target.b]);
      expect(removed.error ? [] : removed.data, `${who} removes B's file`).toEqual([]);
      const wildcard = await files.remove([`${target.folderB}/`, `${target.folderB}/%`, `%`]);
      expect(wildcard.error ? [] : wildcard.data, `${who} removes with wildcards`).toEqual([]);
      // Path tricks: dot segments and encoded separators must not reach B's folder.
      for (const trick of [`${a.id}/../${target.b}`, `${a.id}/..%2F${target.b}`, `./${target.b}`, `//${target.b}`]) {
        const attempt = await files.download(trick);
        expect(attempt.error, `${who} downloads ${trick}`).not.toBeNull();
      }
    }
    // B's file is exactly as stored, and the folder holds nothing else.
    const after = await adminClient().storage.from(bucket).download(target.b);
    expect(after.error, "B's file is still there").toBeNull();
    expect(new Uint8Array(await after.data!.arrayBuffer())).toEqual(bytes);
    const parent = target.b.split("/").slice(0, -1).join("/");
    const folder = await adminClient().storage.from(bucket).list(parent, { limit: 100 });
    expect(folder.data?.map((entry) => entry.name), "B's folder holds only B's file").toEqual([target.b.split("/").pop()]);
    const aFolder = await adminClient().storage.from(bucket).list(a.id, { limit: 100 });
    expect(aFolder.data ?? [], "nothing was written into A's folder").toEqual([]);
  });

  it("a file is no one's without a row: A cannot park a file under B's id as B", async () => {
    for (const bucket of buckets) {
      const files = a.db.storage.from(bucket);
      const forged = paths[bucket]!.inB(randomUUID());
      expect((await files.upload(forged, bytes, { contentType: "image/png" })).error, `${bucket}: A uploads as B`).not.toBeNull();
    }
  });
});

describe("recipe-images, B's recipe picture attacked by A and anon", () => {
  const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9]);
  let recipeB: string;
  let recipeA: string;
  let pathB: string;
  const attackers = (): [string, Db][] => [["A", a.db], ["anon", anonClient()]];

  beforeAll(async () => {
    const make = async (user: TestUser) => {
      const row = await user.db.from("recipe").insert({ title: "Bild", original_servings: 2, source_kind: "text" }).select("id").single();
      expect(row.error).toBeNull();
      return row.data!.id;
    };
    recipeA = await make(a);
    recipeB = await make(b);
    pathB = `${householdB}/${recipeB}/full`;
    const up = await b.db.storage.from(recipeBucket).upload(pathB, bytes, { contentType: "image/webp" });
    expect(up.error, "B uploads under own recipe").toBeNull();
  });

  afterAll(async () => {
    await adminClient().storage.from(recipeBucket).remove([pathB]);
  });

  it("refuses reading, listing, signing and copying B's picture", async () => {
    expect((await b.db.storage.from(recipeBucket).download(pathB)).error, "B reads own").toBeNull();
    for (const [who, db] of attackers()) {
      const files = db.storage.from(recipeBucket);
      expect((await files.download(pathB)).error, `${who} downloads`).not.toBeNull();
      expect((await files.createSignedUrl(pathB, 60)).error, `${who} signs`).not.toBeNull();
      expect((await files.list(householdB)).data ?? [], `${who} lists B's household folder`).toEqual([]);
      expect((await files.list(`${householdB}/${recipeB}`)).data ?? [], `${who} lists B's recipe folder`).toEqual([]);
      expect((await files.copy(pathB, `${householdA}/${recipeA}/full`)).error, `${who} copies B's picture under A's recipe`).not.toBeNull();
      expect((await fetch(files.getPublicUrl(pathB).data.publicUrl)).status, `${who} fetches the public URL`).not.toBe(200);
    }
    const session = (await a.db.auth.getSession()).data.session!;
    const direct = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/${recipeBucket}/${pathB}`, {
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    });
    expect(direct.status, "A fetches B's picture with a token over HTTP").not.toBe(200);
  });

  it("refuses writing over, into or out of B's picture, and forging a path as B", async () => {
    for (const [who, db] of attackers()) {
      const files = db.storage.from(recipeBucket);
      expect((await files.upload(pathB, bytes, { contentType: "image/webp", upsert: true })).error, `${who} overwrites`).not.toBeNull();
      expect((await files.upload(`${householdB}/${recipeB}/thumb`, bytes, { contentType: "image/webp" })).error, `${who} adds to B's recipe`).not.toBeNull();
      expect((await files.upload(`${householdB}/${recipeA}/full`, bytes, { contentType: "image/webp" })).error, `${who} adds under A's recipe in B's folder`).not.toBeNull();
      expect((await files.upload(`${householdA}/${recipeB}/full`, bytes, { contentType: "image/webp" })).error, `${who} adds under B's recipe in A's folder`).not.toBeNull();
      expect((await files.move(pathB, `${householdA}/${recipeA}/full`)).error, `${who} moves B's picture`).not.toBeNull();
      expect((await files.remove([pathB])).data ?? [], `${who} removes`).toEqual([]);
      expect((await files.remove([`${householdB}/%`, "%"])).data ?? [], `${who} removes with wildcards`).toEqual([]);
      expect((await files.createSignedUploadUrl(pathB, { upsert: true })).error, `${who} gets an upload URL for B's picture`).not.toBeNull();
    }
    const after = await adminClient().storage.from(recipeBucket).download(pathB);
    expect(after.error, "B's picture is still there").toBeNull();
    expect(new Uint8Array(await after.data!.arrayBuffer())).toEqual(bytes);
    const folder = await adminClient().storage.from(recipeBucket).list(householdB, { limit: 100 });
    expect(folder.data?.map((entry) => entry.name), "B's folder holds only B's recipe").toEqual([recipeB]);
    expect((await adminClient().storage.from(recipeBucket).list(householdA, { limit: 100 })).data ?? [], "nothing was written into A's folder").toEqual([]);
  });

  it("refuses A pointing a recipe's image_path at B's folder", async () => {
    const attempt = await a.db.from("recipe").update({ image_path: `${householdB}/${recipeB}` }).eq("id", recipeA);
    expect(attempt.error?.code).toBe("23514");
    expect((await b.db.from("recipe").update({ image_path: `${householdB}/${recipeB}` }).eq("id", recipeA).select("id")).data ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Invitations and joining
// ---------------------------------------------------------------------------

describe("joining another household without a valid invitation", () => {
  it("cannot be done by a code that is wrong, odd, or B's household id; and never by anon", async () => {
    const joiner = await createTestUser("sec-joiner");
    const own = await householdOf(joiner.id);
    const oddCodes = [householdB, "", "   ", "A".repeat(5000), "' or '1'='1", "%", "000000", "ZZZZZZ"];
    for (const code of oddCodes) {
      const result = await joiner.db.rpc("accept_household_invite", { code });
      expect(result.error ? [] : result.data, `code ${JSON.stringify(code.slice(0, 20))} joins nothing`).toEqual([]);
    }
    expect(await householdOf(joiner.id), "the joiner is still in their own household").toBe(own);
    expect((await anonClient().rpc("accept_household_invite", { code: "ZZZZZZ" })).error?.code).toBe("42501");
    // The previews tell an unknown code nothing about households, from anon or a user.
    for (const db of [anonClient(), joiner.db]) {
      for (const fn of ["household_invite_preview", "app_invite_preview"] as const) {
        const preview = await db.rpc(fn, { code: householdB });
        expect(JSON.stringify(preview.data ?? null), `${fn} of a household id`).not.toContain(householdB);
      }
    }
  });

  it("is refused with B's revoked or expired code, also to a member of a two-person household, and nothing moves", async () => {
    // A live code is a valid way in by design (household-members.test.ts); a dead one is not.
    const revoked = (await b.db.rpc("create_household_invite")).data![0]!;
    expect((await b.db.rpc("revoke_household_invite", { invite_id: revoked.id })).data).toBe(true);
    const expired = (await b.db.rpc("create_household_invite")).data![0]!;
    const aged = await adminClient().from("household_invite").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", expired.id);
    expect(aged.error).toBeNull();
    for (const user of [a, a2]) {
      for (const code of [revoked.code, expired.code]) {
        const attempt = await user.db.rpc("accept_household_invite", { code });
        expect(attempt.error ? [] : attempt.data, "a dead code joins nothing").toEqual([]);
      }
    }
    expect(await householdOf(a.id)).toBe(householdA);
    expect(await householdOf(a2.id)).toBe(householdA);
    expect((await adminClient().from("household_member").select("user_id").eq("household_id", householdB)).data?.map((row) => row.user_id)).toEqual([b.id]);
  });

  it("gives a plain member no way to take the household over, and A's members no way into B", async () => {
    const before = JSON.stringify((await adminClient().from("household_member").select("*").in("household_id", [householdA, householdB]).order("user_id")).data);
    // a2 (member) tries to make themselves owner, remove the owner, rename and invite as someone else.
    expect((await a2.db.rpc("make_household_owner", { member: a2.id })).error?.code, "a2 makes themself owner").toBe("MK454");
    expect((await a2.db.rpc("remove_household_member", { member: a.id })).error?.code, "a2 removes the owner").toBe("MK454");
    // Neither A nor a2 can name B (or B's household) in any function that takes a member.
    for (const user of [a, a2]) {
      // MK454: not the owner (a2); MK455: not a member of the caller's household (a, the owner).
      expect(["MK454", "MK455"], "removes B").toContain((await user.db.rpc("remove_household_member", { member: b.id })).error?.code);
      expect(["MK454", "MK455"], "makes B owner").toContain((await user.db.rpc("make_household_owner", { member: b.id })).error?.code);
    }
    const after = JSON.stringify((await adminClient().from("household_member").select("*").in("household_id", [householdA, householdB]).order("user_id")).data);
    expect(after, "no membership or role changed").toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 5. What anon sees through the API's own description and GraphQL
// ---------------------------------------------------------------------------

describe("anon through PostgREST's description and GraphQL", () => {
  const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  it("sees no table in the OpenAPI description, and only the listed functions", async () => {
    const response = await fetch(`${base()}/rest/v1/`, { headers: { apikey: key() } });
    // Newer PostgREST refuses the description to anon outright; either is fine, a table list is not.
    if (response.status !== 200) return;
    const spec = (await response.json()) as { paths?: Record<string, unknown> };
    const paths = Object.keys(spec.paths ?? {}).filter((path) => path !== "/");
    const tables = paths.filter((path) => !path.startsWith("/rpc/"));
    expect(tables, "tables in anon's API description").toEqual([]);
    const rpcs = paths.filter((path) => path.startsWith("/rpc/")).map((path) => path.slice(5));
    expect(rpcs.filter((name) => !(name in anonCallable)), "functions in anon's API description").toEqual([]);
  });

  it("gets no table data from GraphQL", async () => {
    const response = await fetch(`${base()}/graphql/v1`, {
      method: "POST",
      headers: { apikey: key(), "content-type": "application/json" },
      body: JSON.stringify({ query: "{ householdCollection { edges { node { id name } } } recipeCollection { edges { node { id title } } } }" }),
    });
    const text = await response.text();
    expect(text, "GraphQL gives anon no household or recipe rows").not.toContain(householdB);
    let json: { data?: Record<string, unknown> | null } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON: the endpoint is closed to anon, which is fine */
    }
    expect(JSON.stringify(json.data ?? {})).not.toMatch(/"edges":\[\{/);
  });

  it("gives a signed-in user from household A no row of B's through GraphQL either", async () => {
    const session = (await a.db.auth.getSession()).data.session!;
    const response = await fetch(`${base()}/graphql/v1`, {
      method: "POST",
      headers: { apikey: key(), authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: "{ householdCollection { edges { node { id } } } household_memberCollection { edges { node { user_id household_id } } } }" }),
    });
    const text = await response.text();
    expect(text, "GraphQL gives A none of B's ids").not.toContain(householdB);
    expect(text).not.toContain(b.id);
  });
});

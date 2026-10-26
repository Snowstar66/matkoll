import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadIngredientNames } from "@/features/catalog/data/queries";
import { PantryDataError } from "@/features/pantry/data/client";
import { insertPantryDefaults } from "@/features/pantry/data/defaults";
import { countPantryIn, listPantryIn, loadPantrySnapshot } from "@/features/pantry/data/queries";
import { applyPantryInventoryIn } from "@/features/pantry/data/inventory";
import { emptyPantryPlaceIn, restorePantryItemIn, restorePantryRemovalIn } from "@/features/pantry/data/remove";
import { setPantryItemsIn } from "@/features/pantry/data/set";
import {
  deleteSiteIn,
  loadPantrySitesIn,
  loadSiteItemCountsIn,
  loadSelectedSiteIdIn,
  saveSiteIn,
  selectSiteIn,
} from "@/features/pantry/data/sites";
import { defaultSiteName, maxSites, normalizeSiteName, siteFormSchema } from "@/features/pantry/domain/site";
import { refusedCodePoints } from "@/lib/one-line";
import { localSupabaseUrl } from "../local-supabase";
import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUsers,
  expectRlsIsolation,
  type Db,
  type TestUser,
} from "./support";

// Places in the pantry against local Supabase (Story 8.1, AD-4, AD-19, AD-20,
// AD-21, AD-24): RLS and the checks on pantry_site, ensure_pantry_defaults(),
// the selected place for writes and direct inserts, every pantry function on
// two places, MK410 for a place that is not the caller's, the reads per place,
// one selected place per user (pantry_site_one_selected), the functions'
// grants, and the migration's postconditions. The 1.0 calls without `site` are
// tests/integration/pantry.test.ts, unchanged. Story 8.2: save_pantry_site,
// select_pantry_site and delete_pantry_site, the limit of 10 places, the data
// layer's outcomes, the place sent with every write from Hemma, and
// pantry_site_gone for a read of a place that is not the user's.

// pantry/server.ts with the session client replaced by the test user's, so
// getSelectedSite and listPantrySites run as they do in a request.
let sessionDb: Db | undefined;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!sessionDb) throw new Error("No session client");
    return sessionDb;
  },
}));
vi.mock("@/features/auth/server", () => ({ requireUser: vi.fn() }));
const pantryServer = await import("@/features/pantry/server");

let unique = 0;
const uniqueName = (base: string) => `${base} ${Date.now()}-${unique++}`;
const madeUpId = "00000000-0000-4000-8000-000000000000";

async function addIngredient(db: Db, name: string, location = "Kyl"): Promise<string> {
  const { data, error } = await db
    .from("ingredient")
    .insert({ name, normalized_name: name.toLocaleLowerCase("sv-SE"), section: "Övrigt", location })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** A place for `userId`, added with the service role, not selected unless asked. */
async function addSite(userId: string, name: string, selected = false): Promise<string> {
  const { data, error } = await adminClient()
    .from("pantry_site")
    .insert({ user_id: userId, name, normalized_name: normalizeSiteName(name), is_selected: selected })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * One SQL statement against local Postgres as the superuser, through the
 * Supabase CLI (a dev dependency, also in CI): for what PostgREST cannot do,
 * such as two writes in one transaction or reading pg_proc. Its rows; throws,
 * with Postgres's message, when the statement fails.
 */
function sql<Row>(statement: string): Row[] {
  const out = execFileSync("node_modules/.bin/supabase", ["db", "query", "--local", "-o", "json", statement], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // A statement without rows (DO) prints only its command tag. The rows come as a plain JSON
  // array, or wrapped as { rows } when the CLI detects an AI agent in its environment.
  const text = out.trim();
  if (!text.startsWith("[") && !text.startsWith("{")) {
    if (/^\s*select\b/i.test(statement)) throw new Error(`supabase db query gave no JSON: ${text.slice(0, 500)}`);
    return [];
  }
  const json = JSON.parse(text) as Row[] | { rows?: Row[] };
  const rows = Array.isArray(json) ? json : json.rows;
  if (!Array.isArray(rows)) throw new Error(`supabase db query gave no rows: ${text.slice(0, 500)}`);
  return rows;
}

/** Runs `statements` in one transaction, checking the deferred constraints at its end, and expects SQLSTATE `code` ("none": success, committed). */
function expectSqlState(statements: string, code: string): void {
  sql(`do $test$
declare
  got text := 'none';
begin
  begin
    ${statements}
    set constraints all immediate;
  exception
    when others then got := sqlstate;
  end;
  if got is distinct from '${code}' then
    raise exception 'expected ${code}, got %', got;
  end if;
end
$test$`);
}

/** Makes `siteId` the user's selected place in one transaction, behind the functions' back (select_pantry_site is Story 8.2). */
async function selectSite(userId: string, siteId: string): Promise<void> {
  expectSqlState(
    `update public.pantry_site set is_selected = false where user_id = '${userId}' and is_selected;
    update public.pantry_site set is_selected = true where id = '${siteId}';`,
    "none",
  );
}

async function sitesOf(userId: string) {
  const { data, error } = await adminClient()
    .from("pantry_site")
    .select("id, name, normalized_name, is_selected")
    .eq("user_id", userId)
    .order("created_at")
    .order("id");
  if (error) throw error;
  return data;
}

type Seed = { site_id: string; ingredient_id: string; location: string; amount?: number | null; unit?: string | null };

/** Pantry rows for `userId` on the given places, added with the service role; their ids. */
async function seed(userId: string, rows: Seed[]): Promise<string[]> {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .insert(rows.map((row) => ({ user_id: userId, amount: null, unit: null, ...row })))
    .select("id");
  if (error) throw error;
  return data.map((row) => row.id);
}

/** The user's rows as (place, ingredient, location, amount, unit), read with the service role, in a fixed order. */
async function stateOf(userId: string) {
  const { data, error } = await adminClient()
    .from("pantry_item")
    .select("id, site_id, ingredient_id, location, amount, unit")
    .eq("user_id", userId);
  if (error) throw error;
  return data
    .map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount) }))
    .sort((a, b) =>
      `${a.site_id}|${a.ingredient_id}|${a.location}|${a.unit ?? ""}`.localeCompare(
        `${b.site_id}|${b.ingredient_id}|${b.location}|${b.unit ?? ""}`,
      ),
    );
}

/** The user's rows on one place, without ids. */
async function onSite(userId: string, siteId: string) {
  return (await stateOf(userId))
    .filter((row) => row.site_id === siteId)
    .map(({ ingredient_id, location, amount, unit }) => ({ ingredient_id, location, amount, unit }));
}

/** A user with Hemma (selected, from ensure_pantry_defaults) and Stugan (not selected), and milk in the catalog. */
async function twoPlaces(name: string) {
  const user = await createTestUser(name);
  const defaults = await user.db.rpc("ensure_pantry_defaults");
  if (defaults.error) throw defaults.error;
  const [hemma] = await sitesOf(user.id);
  const stugan = await addSite(user.id, "Stugan");
  const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
  return { user, hemma: hemma.id, stugan, mjolk };
}

const names = (user: TestUser) => (ids: readonly string[]) => loadIngredientNames(user.db, ids);

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("the migration's postconditions", () => {
  // First, before this file adds places; each user it adds keeps one selected place all the same.
  it("every pantry row is on a place of its own user, and every user with places has exactly one selected", async () => {
    const admin = adminClient();
    const [items, sites, removals] = await Promise.all([
      admin.from("pantry_item").select("id, user_id, site_id"),
      admin.from("pantry_site").select("id, user_id, is_selected"),
      admin.from("pantry_removal").select("removed_rows"),
    ]);
    if (items.error || sites.error || removals.error) throw items.error ?? sites.error ?? removals.error;

    const owner = new Map(sites.data.map((site) => [site.id, site.user_id]));
    expect(items.data.filter((item) => owner.get(item.site_id) !== item.user_id)).toEqual([]);

    const selected = new Map<string, number>();
    for (const site of sites.data) selected.set(site.user_id, (selected.get(site.user_id) ?? 0) + (site.is_selected ? 1 : 0));
    expect([...selected].filter(([, count]) => count !== 1)).toEqual([]);

    const withoutSite = removals.data
      .flatMap((removal) => removal.removed_rows as Record<string, unknown>[])
      .filter((row) => typeof row?.site_id !== "string");
    expect(withoutSite).toEqual([]);
  });

  it("every stored removed row is on a place of the removal's user, and every user with pantry rows has a place", async () => {
    const admin = adminClient();
    const [items, sites, removals] = await Promise.all([
      admin.from("pantry_item").select("user_id"),
      admin.from("pantry_site").select("id, user_id"),
      admin.from("pantry_removal").select("id, user_id, removed_rows"),
    ]);
    if (items.error || sites.error || removals.error) throw items.error ?? sites.error ?? removals.error;

    const owner = new Map(sites.data.map((site) => [site.id, site.user_id]));
    const foreign = removals.data.flatMap((removal) =>
      (removal.removed_rows as Record<string, unknown>[])
        .filter((row) => owner.get(String(row?.site_id)) !== removal.user_id)
        .map((row) => `${removal.id}: ${String(row?.id)}`),
    );
    expect(foreign).toEqual([]);

    const withPlaces = new Set(sites.data.map((site) => site.user_id));
    expect([...new Set(items.data.map((item) => item.user_id))].filter((id) => !withPlaces.has(id))).toEqual([]);
  });
});

describe("pantry_site: schema and RLS", () => {
  it("isolates pantry_site", async () => {
    await expectRlsIsolation("pantry_site", async () => ({ name: "Stugan", normalized_name: "stugan", is_selected: true }));
  });

  it("refuses anon the table and every new or changed function", async () => {
    const anon = anonClient();
    expect((await anon.from("pantry_site").select("id")).error?.code).toBe("42501");
    expect((await anon.from("pantry_site").insert({ name: "Stugan", normalized_name: "stugan" })).error?.code).toBe("42501");

    const calls = [
      anon.rpc("ensure_pantry_defaults"),
      anon.rpc("pantry_selected_site", {}),
      anon.rpc("pantry_target_site", { site: madeUpId }),
      anon.rpc("pantry_session_site"),
      anon.rpc("pantry_owner_lock", { owner: madeUpId }),
      anon.rpc("set_pantry_items", { items: [], site: madeUpId }),
      anon.rpc("add_to_pantry", { items: [], site: madeUpId }),
      anon.rpc("pantry_place_has_item", { ingredient: madeUpId, place: "Kyl", item_unit: "l", site: madeUpId }),
      anon.rpc("restore_pantry_item", { item: {}, site: madeUpId }),
      anon.rpc("empty_pantry_place", { place: "Kyl", operation_id: madeUpId, site: madeUpId }),
      anon.rpc("restore_pantry_removal", { operation_id: madeUpId, site: madeUpId }),
      anon.rpc("apply_pantry_inventory", {
        place: "Kyl",
        items: [],
        replace_ids: [],
        remove_ids: [],
        operation_id: madeUpId,
        site: madeUpId,
      }),
      anon.rpc("save_pantry_site", { site_id: madeUpId, site_name: "Stugan", site_normalized_name: "stugan", mode: "add" }),
      anon.rpc("select_pantry_site", { site_id: madeUpId }),
      anon.rpc("delete_pantry_site", { site_id: madeUpId }),
      anon.rpc("pantry_site_item_counts"),
    ];
    for (const [index, call] of calls.entries()) {
      expect((await call).error?.code, `call ${index}`).toBe("42501");
    }
  });

  it("gives execute on every pantry function to authenticated only, never anon or public, and none is security definer", () => {
    const functions = [
      "set_pantry_items",
      "add_to_pantry",
      "pantry_place_has_item",
      "restore_pantry_item",
      "empty_pantry_place",
      "restore_pantry_removal",
      "apply_pantry_inventory",
      "ensure_pantry_defaults",
      "pantry_target_site",
      "pantry_selected_site",
      "pantry_owner_lock",
      "pantry_session_site",
      "pantry_item_fill_site",
      "pantry_site_check_selected",
      "save_pantry_site",
      "select_pantry_site",
      "delete_pantry_site",
      "pantry_site_check_limit",
      "pantry_site_item_counts",
    ];
    const rows = sql<{ name: string; definer: boolean; acl: string | null }>(
      `select p.proname as name, p.prosecdef as definer, p.proacl::text as acl
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (${functions.map((name) => `'${name}'`).join(", ")})`,
    );
    expect(rows.map((row) => row.name).sort()).toEqual([...functions].sort());
    for (const row of rows) {
      expect(row.definer, row.name).toBe(false);
      const entries = (row.acl ?? "").replace(/[{}]/g, "").split(",").filter(Boolean);
      // An entry "=X/postgres" (no role) would be public.
      expect(entries.filter((entry) => entry.startsWith("=") || entry.startsWith("anon=")), row.name).toEqual([]);
    }
    const executableBy = (name: string) =>
      (rows.find((row) => row.name === name)?.acl ?? "")
        .replace(/[{}]/g, "")
        .split(",")
        .filter((entry) => entry.includes("=X"))
        .map((entry) => entry.split("=")[0])
        .filter((role) => role !== "postgres")
        .sort();
    for (const name of functions.slice(0, 9)) expect(executableBy(name), name).toEqual(["authenticated"]);
    expect(executableBy("pantry_selected_site")).toEqual(["authenticated", "service_role"]);
    expect(executableBy("pantry_owner_lock")).toEqual(["authenticated", "service_role"]);
    expect(executableBy("pantry_session_site")).toEqual(["authenticated", "service_role"]);
    expect(executableBy("pantry_item_fill_site")).toEqual([]);
    expect(executableBy("pantry_site_check_selected")).toEqual([]);
    for (const name of ["save_pantry_site", "select_pantry_site", "delete_pantry_site", "pantry_site_item_counts"]) {
      expect(executableBy(name), name).toEqual(["authenticated"]);
    }
    expect(executableBy("pantry_site_check_limit")).toEqual([]);
  });

  it("refuses an empty name, more than 40 characters, spaces at the ends and every refused character", async () => {
    const user = await createTestUser("pantry-site-checks");
    const insert = (name: string, normalized = normalizeSiteName(name) || "x", selected = false) =>
      user.db.from("pantry_site").insert({ name, normalized_name: normalized, is_selected: selected });

    const refused = [
      "",
      "a".repeat(41),
      " Stugan",
      "Stugan ",
      ...refusedCodePoints.flatMap(([from, to]) =>
        Array.from({ length: to - from + 1 }, (_, i) => `Stu${String.fromCodePoint(from + i)}gan`),
      ),
    ];
    for (const name of refused) {
      expect((await insert(name)).error?.code, JSON.stringify(name)).toBe("23514");
    }
    expect((await insert("Stugan", "")).error?.code, "an empty normalized name").toBe("23514");
    expect((await sitesOf(user.id)).length).toBe(0);

    // 40 characters, counted as code points, and a Swedish name are fine.
    expect((await insert("å".repeat(40), undefined, true)).error).toBeNull();
    expect((await insert("Torpet vid sjön")).error).toBeNull();
  });

  it("refuses a name that normalizes like another of the user's, and a second selected place", async () => {
    const user = await createTestUser("pantry-site-unique");
    const other = await createTestUser("pantry-site-unique-other");
    await addSite(user.id, "Stugan", true);

    const duplicate = await user.db.from("pantry_site").insert({ name: "STUGAN", normalized_name: normalizeSiteName("STUGAN") });
    expect(duplicate.error?.code).toBe("23505");
    const selected = await user.db.from("pantry_site").insert({ name: "Torpet", normalized_name: "torpet", is_selected: true });
    expect(selected.error?.code).toBe("23505");

    // Another user may have the same name, selected.
    expect((await other.db.from("pantry_site").insert({ name: "Stugan", normalized_name: "stugan", is_selected: true })).error).toBeNull();
  });

  it("keeps exactly one selected place for a user with places, checked at commit (pantry_site_one_selected)", async () => {
    const { user, hemma, stugan } = await twoPlaces("pantry-site-one-selected");

    // The selected place cannot go while another place is left, nor be unselected alone.
    expect((await user.db.from("pantry_site").delete().eq("id", hemma)).error?.code).toBe("23514");
    expect((await user.db.from("pantry_site").update({ is_selected: false }).eq("id", hemma)).error?.code).toBe("23514");
    expect(await sitesOf(user.id)).toMatchObject([
      { id: hemma, is_selected: true },
      { id: stugan, is_selected: false },
    ]);

    // Clearing one and setting another in one transaction is a selection (select_pantry_site, Story 8.2).
    expectSqlState(
      `update public.pantry_site set is_selected = false where id = '${hemma}';
      update public.pantry_site set is_selected = true where id = '${stugan}';`,
      "none",
    );
    expect(await sitesOf(user.id)).toMatchObject([
      { id: hemma, is_selected: false },
      { id: stugan, is_selected: true },
    ]);
    // Clearing alone, in one transaction, is refused at its end.
    expectSqlState(`update public.pantry_site set is_selected = false where id = '${stugan}';`, "23514");

    // The last place may go, selected or not: a user without places is allowed.
    expect((await user.db.from("pantry_site").delete().eq("id", hemma)).error).toBeNull();
    expect((await user.db.from("pantry_site").delete().eq("id", stugan)).error).toBeNull();
    expect(await sitesOf(user.id)).toEqual([]);
  });

  it("orders the places by creation, not by name", async () => {
    const { user, hemma, stugan } = await twoPlaces("pantry-site-order");
    const annexet = await addSite(user.id, "Annexet");
    expect((await loadPantrySitesIn(user.db)).map((site) => site.id)).toEqual([hemma, stugan, annexet]);
  });

  it("refuses to delete a place that has items, and keeps the items", async () => {
    const { user, stugan, mjolk } = await twoPlaces("pantry-site-restrict");
    await seed(user.id, [{ site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);

    const deleted = await user.db.from("pantry_site").delete().eq("id", stugan);
    expect(deleted.error?.code).toBe("23503");
    expect(await onSite(user.id, stugan)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
  });

  it("refuses a pantry row on another user's place", async () => {
    const { user, mjolk } = await twoPlaces("pantry-site-other-place");
    const other = await createTestUser("pantry-site-other-place-other");
    const othersPlace = await addSite(other.id, "Stugan", true);

    const inserted = await user.db.from("pantry_item").insert({ site_id: othersPlace, ingredient_id: mjolk, location: "Kyl" });
    expect(inserted.error?.code).toBe("23503");
  });

  it("goes with its user, items and all", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-delete-user");
    await seed(user.id, [
      { site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" },
    ]);
    expect((await adminClient().auth.admin.deleteUser(user.id)).error).toBeNull();
    expect(await sitesOf(user.id)).toEqual([]);
    expect(await stateOf(user.id)).toEqual([]);
  });
});

describe("the selected place and the start data", () => {
  it("ensure_pantry_defaults() creates Hemma as the selected place once", async () => {
    const user = await createTestUser("pantry-site-defaults");
    expect(await sitesOf(user.id)).toEqual([]);

    expect((await user.db.rpc("ensure_pantry_defaults")).error).toBeNull();
    const [hemma, ...rest] = await sitesOf(user.id);
    expect(rest).toEqual([]);
    expect(hemma).toEqual({
      id: expect.any(String),
      name: defaultSiteName,
      normalized_name: normalizeSiteName(defaultSiteName),
      is_selected: true,
    });

    expect((await user.db.rpc("ensure_pantry_defaults")).error).toBeNull();
    expect(await sitesOf(user.id)).toEqual([hemma]);
  });

  it("insertPantryDefaults and ensurePantryDefaults give one selected Hemma, and an rpc error is a PantryDataError", async () => {
    const user = await createTestUser("pantry-site-defaults-ts");
    await insertPantryDefaults(user.db);
    sessionDb = user.db;
    await pantryServer.ensurePantryDefaults();
    expect(await sitesOf(user.id)).toMatchObject([{ name: defaultSiteName, is_selected: true }]);
    expect(await pantryServer.getSelectedSite()).toMatchObject({ name: defaultSiteName, siteCount: 1 });

    await expect(insertPantryDefaults(anonClient())).rejects.toThrow(new PantryDataError("ensure_pantry_defaults 42501"));
  });

  it("refuses a siteId that is not a uuid in the reads", async () => {
    const user = await createTestUser("pantry-site-invalid-id");
    await expect(countPantryIn(user.db, "stugan")).rejects.toThrow(new PantryDataError("invalid_site"));
    await expect(loadPantrySnapshot(user.db, "stugan")).rejects.toThrow(new PantryDataError("invalid_site"));
    await expect(listPantryIn(user.db, "Kyl", names(user), "stugan")).rejects.toThrow(new PantryDataError("invalid_site"));
    sessionDb = user.db;
    await expect(pantryServer.getPantrySnapshot("stugan")).rejects.toThrow(new PantryDataError("invalid_site"));
  });

  it("ensure_pantry_defaults() adds nothing for a user who has a place", async () => {
    const user = await createTestUser("pantry-site-defaults-has");
    const stugan = await addSite(user.id, "Stugan", true);
    expect((await user.db.rpc("ensure_pantry_defaults")).error).toBeNull();
    expect(await sitesOf(user.id)).toEqual([{ id: stugan, name: "Stugan", normalized_name: "stugan", is_selected: true }]);
  });

  it("gives a user without places no selected place and an empty pantry, and creates nothing when reading", async () => {
    const user = await createTestUser("pantry-site-none");
    expect(await loadPantrySitesIn(user.db)).toEqual([]);
    expect(await loadSelectedSiteIdIn(user.db)).toBeNull();
    expect(await listPantryIn(user.db, "Kyl", names(user))).toEqual([]);
    expect(await countPantryIn(user.db)).toEqual({ Kyl: 0, Frys: 0, Skafferi: 0 });
    expect(await loadPantrySnapshot(user.db)).toEqual(new Map());

    sessionDb = user.db;
    expect(await pantryServer.getSelectedSite()).toBeNull();
    expect(await pantryServer.listPantrySites()).toEqual([]);
    expect(await pantryServer.getPantrySnapshot()).toEqual(new Map());
    expect(await pantryServer.countPantryItems()).toEqual({ Kyl: 0, Frys: 0, Skafferi: 0 });
    expect(await pantryServer.listPantry("Kyl")).toEqual([]);

    const has = await user.db.rpc("pantry_place_has_item", { ingredient: madeUpId, place: "Kyl", item_unit: "l" });
    expect(has.data).toBe(false);
    expect(await sitesOf(user.id)).toEqual([]);
  });

  it("creates Hemma, selected, when a user without places writes", async () => {
    const user = await createTestUser("pantry-site-write-first");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const set = await user.db.rpc("set_pantry_items", {
      items: [{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }],
    });
    expect(set.error).toBeNull();
    const [hemma, ...rest] = await sitesOf(user.id);
    expect(rest).toEqual([]);
    expect(hemma).toMatchObject({ name: defaultSiteName, is_selected: true });
    expect(set.data?.[0]).toMatchObject({ site_id: hemma.id });
  });

  it("puts a row inserted without site_id on the owner's selected place, creating Hemma when needed", async () => {
    const user = await createTestUser("pantry-site-direct");
    const mjolk = await addIngredient(user.db, uniqueName("Mjölk"));
    const smor = await addIngredient(user.db, uniqueName("Smör"));

    // The service role, as the e2e seeds insert: Hemma is created.
    const seeded = await adminClient()
      .from("pantry_item")
      .insert({ user_id: user.id, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" })
      .select("site_id")
      .single();
    expect(seeded.error).toBeNull();
    const [hemma] = await sitesOf(user.id);
    expect(hemma).toMatchObject({ name: defaultSiteName, is_selected: true });
    expect(seeded.data?.site_id).toBe(hemma.id);

    // Another selected place: the next row without site_id goes there.
    const stugan = await addSite(user.id, "Stugan");
    await selectSite(user.id, stugan);
    const own = await user.db.from("pantry_item").insert({ ingredient_id: smor, location: "Kyl" }).select("site_id").single();
    expect(own.error).toBeNull();
    expect(own.data?.site_id).toBe(stugan);

    // A set site_id is left as it is.
    const kept = await user.db
      .from("pantry_item")
      .insert({ site_id: hemma.id, ingredient_id: smor, location: "Kyl" })
      .select("site_id")
      .single();
    expect(kept.data?.site_id).toBe(hemma.id);
  });

  it("refuses to create a place for another user through a direct insert", async () => {
    const owner = await createTestUser("pantry-site-direct-owner");
    const other = await createTestUser("pantry-site-direct-other");
    const mjolk = await addIngredient(owner.db, uniqueName("Mjölk"));
    const inserted = await other.db.from("pantry_item").insert({ user_id: owner.id, ingredient_id: mjolk, location: "Kyl" });
    expect(inserted.error?.code).toBe("42501");
    expect(await sitesOf(owner.id)).toEqual([]);
  });
});

describe("the pantry functions on two places", () => {
  it("set_pantry_items: sets on the given place, or the selected one, and keeps unlimited or amounts per place", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-set");
    const [hemmaRow] = await seed(user.id, [
      { site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
    ]);

    // Unlimited on Stugan leaves Hemma's amount.
    const unlimited = await user.db.rpc("set_pantry_items", {
      items: [{ ingredient_id: mjolk, location: "Kyl", amount: null, unit: null }],
      site: stugan,
    });
    expect(unlimited.error).toBeNull();
    expect(unlimited.data?.[0]).toMatchObject({ site_id: stugan, amount: null, unit: null });
    expect(await onSite(user.id, stugan)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: null, unit: null }]);
    expect(await onSite(user.id, hemma)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);

    // Without site: Hemma, the selected place, on the same row.
    const set = await user.db.rpc("set_pantry_items", {
      items: [{ ingredient_id: mjolk, location: "Kyl", amount: 3, unit: "l" }],
    });
    expect(set.data).toEqual([expect.objectContaining({ id: hemmaRow, site_id: hemma, amount: 3 })]);
    expect(await onSite(user.id, stugan)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: null, unit: null }]);

    // replace_id on another place than the target is never removed.
    const stuganRow = unlimited.data![0].id;
    const smor = await addIngredient(user.db, uniqueName("Smör"));
    const replaced = await user.db.rpc("set_pantry_items", {
      items: [{ ingredient_id: smor, location: "Kyl", amount: 250, unit: "g" }],
      replace_id: stuganRow,
      site: hemma,
    });
    expect(replaced.error).toBeNull();
    expect((await stateOf(user.id)).some((row) => row.id === stuganRow)).toBe(true);
    expect((await onSite(user.id, hemma)).filter((row) => row.ingredient_id === smor)).toEqual([
      { ingredient_id: smor, location: "Kyl", amount: 250, unit: "g" },
    ]);
  });

  it("add_to_pantry: adds on the given place, and 'already unlimited' is per place", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-add");
    await seed(user.id, [
      { site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: stugan, ingredient_id: mjolk, location: "Kyl" },
    ]);
    const item = (key: string) => ({ key, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" });

    // Unlimited on Stugan: nothing changes there.
    expect((await user.db.rpc("add_to_pantry", { items: [item(randomUUID())], site: stugan })).data).toBe(1);
    expect(await onSite(user.id, stugan)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: null, unit: null }]);
    expect(await onSite(user.id, hemma)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);

    // Without site: Hemma's amount increases.
    expect((await user.db.rpc("add_to_pantry", { items: [item(randomUUID())] })).data).toBe(1);
    expect(await onSite(user.id, hemma)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" }]);
    expect(await onSite(user.id, stugan)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: null, unit: null }]);

    // A new item on Stugan only.
    const smor = await addIngredient(user.db, uniqueName("Smör"));
    await user.db.rpc("add_to_pantry", {
      items: [{ key: randomUUID(), ingredient_id: smor, location: "Kyl", amount: 250, unit: "g" }],
      site: stugan,
    });
    expect((await onSite(user.id, stugan)).map((row) => row.ingredient_id).sort()).toEqual([mjolk, smor].sort());
    expect((await onSite(user.id, hemma)).map((row) => row.ingredient_id)).toEqual([mjolk]);
  });

  it("pantry_place_has_item: reads the given place, or the selected one", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-has");
    await seed(user.id, [{ site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const has = async (site?: string) =>
      (await user.db.rpc("pantry_place_has_item", { ingredient: mjolk, place: "Kyl", item_unit: "l", ...(site ? { site } : {}) }))
        .data;
    expect(await has(stugan)).toBe(true);
    expect(await has(hemma)).toBe(false);
    expect(await has()).toBe(false);
    await selectSite(user.id, stugan);
    expect(await has()).toBe(true);
  });

  it("restore_pantry_item: puts the row back on its own place, also when another is selected", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-restore-item");
    const [row] = await seed(user.id, [{ site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const removed = await user.db.from("pantry_item").delete().eq("id", row).select("*").single();
    if (removed.error) throw removed.error;

    const restored = await user.db.rpc("restore_pantry_item", { item: removed.data });
    expect(restored.error).toBeNull();
    expect(restored.data).toMatchObject({ id: row, site_id: stugan });
    expect(await onSite(user.id, hemma)).toEqual([]);

    // A row without site_id goes to `site`, or else to the selected place.
    const smor = await addIngredient(user.db, uniqueName("Smör"));
    const bare = (id: string) => ({ id, ingredient_id: smor, location: "Kyl", amount: 250, unit: "g" });
    expect((await user.db.rpc("restore_pantry_item", { item: bare(randomUUID()), site: stugan })).data).toMatchObject({
      site_id: stugan,
    });
    expect((await user.db.rpc("restore_pantry_item", { item: bare(randomUUID()) })).data).toMatchObject({ site_id: hemma });
  });

  it("empty_pantry_place: removes only the place's rows, and keeps site_id with them", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-empty");
    const [, stuganRow] = await seed(user.id, [
      { site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" },
    ]);

    const operation = randomUUID();
    const emptied = await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation, site: stugan });
    expect(emptied.error).toBeNull();
    expect(emptied.data).toEqual({
      removed: 1,
      items: [{ id: stuganRow, site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" }],
    });
    expect(await onSite(user.id, stugan)).toEqual([]);
    expect(await onSite(user.id, hemma)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);

    // The same operation again: the stored record, nothing more removed.
    expect((await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation })).data).toEqual(emptied.data);
    expect(await onSite(user.id, hemma)).toHaveLength(1);

    // Without site: Hemma's Kyl.
    expect((await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: randomUUID() })).data).toMatchObject({
      removed: 1,
    });
    expect(await onSite(user.id, hemma)).toEqual([]);
  });

  it("restore_pantry_removal: puts each row back on its own place, also when another is selected", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-restore-removal");
    await seed(user.id, [
      { site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" },
    ]);
    const operation = randomUUID();
    await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation });
    await selectSite(user.id, stugan);

    const restored = await user.db.rpc("restore_pantry_removal", { operation_id: operation });
    expect(restored.error).toBeNull();
    expect(restored.data).toMatchObject({ skipped: 0, restored: [{ site_id: hemma, amount: 1, unit: "l" }] });
    expect(await onSite(user.id, hemma)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    expect(await onSite(user.id, stugan)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" }]);
  });

  it("restore_pantry_removal: skips a row whose place is gone, and counts it", async () => {
    const { user, mjolk } = await twoPlaces("pantry-site-restore-gone");
    const torpet = await addSite(user.id, "Torpet");
    await seed(user.id, [{ site_id: torpet, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const operation = randomUUID();
    await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation, site: torpet });
    expect((await user.db.from("pantry_site").delete().eq("id", torpet)).error).toBeNull();

    const restored = await user.db.rpc("restore_pantry_removal", { operation_id: operation });
    expect(restored.error).toBeNull();
    expect(restored.data).toEqual({ restored: [], skipped: 1 });
    expect(await stateOf(user.id)).toEqual([]);
  });

  it("restore_pantry_removal: puts a stored row without site_id on `site`, or the selected place", async () => {
    const { user, stugan, mjolk } = await twoPlaces("pantry-site-restore-bare");
    const operation = randomUUID();
    const stored = await adminClient()
      .from("pantry_removal")
      .insert({
        id: operation,
        user_id: user.id,
        removed_rows: [{ id: randomUUID(), ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }],
      });
    if (stored.error) throw stored.error;
    const restored = await user.db.rpc("restore_pantry_removal", { operation_id: operation, site: stugan });
    expect(restored.data).toMatchObject({ skipped: 0, restored: [{ site_id: stugan }] });
  });

  it("apply_pantry_inventory: replaces and removes only on the given place, and sets the items there", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-inventory");
    const smor = await addIngredient(user.db, uniqueName("Smör"));
    const [hemmaMjolk, stuganMjolk, hemmaSmor, stuganSmor] = await seed(user.id, [
      { site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: hemma, ingredient_id: smor, location: "Kyl", amount: 250, unit: "g" },
      { site_id: stugan, ingredient_id: smor, location: "Kyl", amount: 250, unit: "g" },
    ]);

    const applied = await user.db.rpc("apply_pantry_inventory", {
      place: "Kyl",
      items: [{ ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "dl" }],
      replace_ids: [hemmaMjolk, stuganMjolk],
      remove_ids: [hemmaSmor, stuganSmor],
      operation_id: randomUUID(),
      site: stugan,
    });
    expect(applied.error).toBeNull();
    expect(applied.data).toMatchObject({
      set: [{ site_id: stugan, ingredient_id: mjolk, amount: 2, unit: "dl" }],
      removed: [{ id: stuganSmor, site_id: stugan }],
      replaced: 1,
      undoable: 1,
    });
    expect(await onSite(user.id, stugan)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "dl" }]);
    expect((await onSite(user.id, hemma)).length).toBe(2);

    // Without site: Hemma.
    const onHemma = await user.db.rpc("apply_pantry_inventory", {
      place: "Kyl",
      items: [],
      replace_ids: [],
      remove_ids: [hemmaSmor, stuganMjolk],
      operation_id: randomUUID(),
    });
    expect(onHemma.data).toMatchObject({ removed: [{ id: hemmaSmor, site_id: hemma }] });
    expect(await onSite(user.id, hemma)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    expect(await onSite(user.id, stugan)).toHaveLength(1);
  });

  it("restore_pantry_item: the item's own place comes before `site`, and `site` before the selected place", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-restore-order");
    const own = { id: randomUUID(), site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" };
    expect((await user.db.rpc("restore_pantry_item", { item: own, site: hemma })).data).toMatchObject({ site_id: stugan });

    const smor = await addIngredient(user.db, uniqueName("Smör"));
    const bare = { id: randomUUID(), ingredient_id: smor, location: "Kyl", amount: 250, unit: "g" };
    expect((await user.db.rpc("restore_pantry_item", { item: bare, site: stugan })).data).toMatchObject({ site_id: stugan });
    expect(await onSite(user.id, hemma)).toEqual([]);
  });

  it("restore_pantry_removal: a stale `site` never blocks rows that have their own place", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-restore-stale");
    const other = await createTestUser("pantry-site-restore-stale-other");
    const othersPlace = await addSite(other.id, "Stugan", true);
    await seed(user.id, [{ site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" }]);
    const operation = randomUUID();
    await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation, site: stugan });

    const restored = await user.db.rpc("restore_pantry_removal", { operation_id: operation, site: othersPlace });
    expect(restored.error).toBeNull();
    expect(restored.data).toMatchObject({ skipped: 0, restored: [{ site_id: stugan }] });
    expect(await onSite(user.id, hemma)).toEqual([]);

    // A stored row without site_id and a `site` that is not the caller's: skipped and counted.
    const bare = randomUUID();
    const stored = await adminClient()
      .from("pantry_removal")
      .insert({
        id: bare,
        user_id: user.id,
        removed_rows: [{ id: randomUUID(), ingredient_id: mjolk, location: "Frys", amount: 1, unit: "l" }],
      });
    if (stored.error) throw stored.error;
    expect((await user.db.rpc("restore_pantry_removal", { operation_id: bare, site: othersPlace })).data).toEqual({
      restored: [],
      skipped: 1,
    });
  });

  it("empty_pantry_place: a replay returns the stored record, also after the place was deleted, and MK409 for another place", async () => {
    const { user, stugan, mjolk } = await twoPlaces("pantry-site-empty-replay");
    const torpet = await addSite(user.id, "Torpet");
    const [row] = await seed(user.id, [{ site_id: torpet, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const operation = randomUUID();
    const first = await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation, site: torpet });
    expect(first.data).toMatchObject({ removed: 1, items: [{ id: row, site_id: torpet }] });
    expect((await user.db.from("pantry_site").delete().eq("id", torpet)).error).toBeNull();

    for (const site of [torpet, undefined]) {
      const replay = await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation, ...(site ? { site } : {}) });
      expect(replay.error).toBeNull();
      expect(replay.data).toEqual(first.data);
    }
    const elsewhere = await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation, site: stugan });
    expect(elsewhere.error?.code).toBe("MK409");
  });

  it("gives MK410 for another user's place or one that does not exist, and writes nothing", async () => {
    const { user, hemma, mjolk } = await twoPlaces("pantry-site-mk410");
    const other = await createTestUser("pantry-site-mk410-other");
    const othersPlace = await addSite(other.id, "Stugan", true);
    const [row] = await seed(user.id, [{ site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const operation = randomUUID();
    await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation });
    await seed(user.id, [{ site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const before = await stateOf(user.id);
    const item = { ingredient_id: mjolk, location: "Kyl", amount: 5, unit: "l" };

    for (const site of [othersPlace, madeUpId]) {
      const calls = [
        user.db.rpc("set_pantry_items", { items: [item], site }),
        user.db.rpc("add_to_pantry", { items: [{ key: randomUUID(), ...item }], site }),
        user.db.rpc("restore_pantry_item", { item: { id: randomUUID(), ...item, location: "Frys" }, site }),
        user.db.rpc("restore_pantry_item", { item: { id: randomUUID(), site_id: site, ...item, location: "Frys" } }),
        user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: randomUUID(), site }),
        user.db.rpc("apply_pantry_inventory", {
          place: "Kyl",
          items: [item],
          replace_ids: [],
          remove_ids: [row],
          operation_id: randomUUID(),
          site,
        }),
      ];
      for (const [index, call] of calls.entries()) {
        expect((await call).error?.code, `call ${index} with ${site === madeUpId ? "a made-up" : "another user's"} place`).toBe(
          "MK410",
        );
      }
    }
    expect(await stateOf(user.id)).toEqual(before);
    expect(await sitesOf(other.id)).toHaveLength(1);
    // pantry_owner_lock takes only the caller's own lock.
    expect((await user.db.rpc("pantry_owner_lock", { owner: other.id })).error?.code).toBe("42501");
    expect((await user.db.rpc("pantry_owner_lock", { owner: user.id })).error).toBeNull();
    // The removal is still there for "Ångra".
    expect((await user.db.rpc("restore_pantry_removal", { operation_id: operation })).error).toBeNull();
  });
});

describe("the reads per place", () => {
  it("never sum over places", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-reads");
    const salt = await addIngredient(user.db, uniqueName("Salt"), "Skafferi");
    await seed(user.id, [
      { site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "l" },
      { site_id: stugan, ingredient_id: mjolk, location: "Frys", amount: 1, unit: "l" },
      { site_id: stugan, ingredient_id: salt, location: "Skafferi" },
    ]);

    // Without a place: Hemma, the selected one.
    expect((await listPantryIn(user.db, "Kyl", names(user))).map((item) => item.amount)).toEqual([1]);
    expect(await countPantryIn(user.db)).toEqual({ Kyl: 1, Frys: 0, Skafferi: 0 });
    expect(await loadPantrySnapshot(user.db)).toEqual(new Map([[mjolk, { unlimited: false, amounts: [{ unit: "l", amount: 1 }] }]]));

    // With Stugan's id: Stugan's alone, summed over its locations.
    expect((await listPantryIn(user.db, "Kyl", names(user), stugan)).map((item) => item.amount)).toEqual([2]);
    expect(await countPantryIn(user.db, stugan)).toEqual({ Kyl: 1, Frys: 1, Skafferi: 1 });
    expect(await loadPantrySnapshot(user.db, stugan)).toEqual(
      new Map([
        [mjolk, { unlimited: false, amounts: [{ unit: "l", amount: 3 }] }],
        [salt, { unlimited: true, amounts: [] }],
      ]),
    );

    // The server's reads, as a page makes them.
    sessionDb = user.db;
    expect(await pantryServer.listPantrySites()).toEqual([
      { id: hemma, name: "Hemma", isSelected: true },
      { id: stugan, name: "Stugan", isSelected: false },
    ]);
    expect(await pantryServer.getSelectedSite()).toEqual({ id: hemma, name: "Hemma", siteCount: 2 });
    expect((await pantryServer.getPantrySnapshot()).get(mjolk)).toEqual({ unlimited: false, amounts: [{ unit: "l", amount: 1 }] });
    expect((await pantryServer.getPantrySnapshot(stugan)).get(mjolk)).toEqual({
      unlimited: false,
      amounts: [{ unit: "l", amount: 3 }],
    });
    expect(await pantryServer.countPantryItems()).toEqual({ Kyl: 1, Frys: 0, Skafferi: 0 });
    expect(await pantryServer.countPantryItems(stugan)).toEqual({ Kyl: 1, Frys: 1, Skafferi: 1 });
    expect((await pantryServer.listPantry("Frys")).length).toBe(0);
    expect((await pantryServer.listPantry("Frys", stugan)).length).toBe(1);

    // Another selected place: the reads without a place follow it.
    await selectSite(user.id, stugan);
    expect(await countPantryIn(user.db)).toEqual({ Kyl: 1, Frys: 1, Skafferi: 1 });
    expect(await pantryServer.getSelectedSite()).toEqual({ id: stugan, name: "Stugan", siteCount: 2 });
  });
});

// Story 8.2: choosing and managing places.

/** The form the sheet Ställen sends, as savePantrySite reads it. */
const siteForm = (id: string, name: string, mode: "add" | "rename") => siteFormSchema.parse({ id, name, mode });

/** save_pantry_site as the app calls it, with the domain's normalized name. */
const savePlace = (db: Db, id: string, name: string, mode: "add" | "rename") =>
  db.rpc("save_pantry_site", { site_id: id, site_name: name, site_normalized_name: normalizeSiteName(name), mode });

describe("save_pantry_site", () => {
  it("adds a place, not selected, and a retry with the same id renames it instead of adding another", async () => {
    const user = await createTestUser("pantry-site-save-add");
    const id = randomUUID();
    const added = await savePlace(user.db, id, "Stugan", "add");
    expect(added.error).toBeNull();
    expect(added.data).toMatchObject({ id, name: "Stugan", normalized_name: "stugan", is_selected: false });
    // A user without places got Hemma first, selected.
    expect((await sitesOf(user.id)).map((site) => [site.name, site.is_selected])).toEqual([
      ["Hemma", true],
      ["Stugan", false],
    ]);

    const retried = await savePlace(user.db, id, "STUGAN", "add");
    expect(retried.error).toBeNull();
    // A true retry (the same normalized name) gets the name as typed now.
    expect(retried.data).toMatchObject({ id, name: "STUGAN" });
    expect(await sitesOf(user.id)).toHaveLength(2);
  });

  it("gives MK424 for a retried add whose place was renamed since, and keeps the rename", async () => {
    const user = await createTestUser("pantry-site-save-stale");
    const id = randomUUID();
    expect((await savePlace(user.db, id, "Stugan", "add")).error).toBeNull();
    // Another device renames it, then the first device retries its add.
    expect((await savePlace(user.db, id, "Vinterstugan", "rename")).error).toBeNull();
    const stale = await savePlace(user.db, id, "Stugan", "add");
    expect(stale.error?.code).toBe("MK424");
    expect((await sitesOf(user.id)).find((site) => site.id === id)).toMatchObject({
      name: "Vinterstugan",
      normalized_name: "vinterstugan",
    });
    expect(await saveSiteIn(user.db, siteForm(id, "Stugan", "add"))).toEqual({ kind: "stale" });
  });

  it("renames the caller's place, and gives MK410 for one that is gone or another user's", async () => {
    const { user, stugan } = await twoPlaces("pantry-site-save-rename");
    const other = await createTestUser("pantry-site-save-rename-other");
    const othersPlace = await addSite(other.id, "Torpet", true);

    expect((await savePlace(user.db, stugan, "Vinterstugan", "rename")).data).toMatchObject({ id: stugan, name: "Vinterstugan" });
    expect((await savePlace(user.db, madeUpId, "Vinterstugan", "rename")).error?.code).toBe("MK410");
    expect((await savePlace(user.db, othersPlace, "Mitt", "rename")).error?.code).toBe("MK410");
    expect(await sitesOf(other.id)).toMatchObject([{ id: othersPlace, name: "Torpet" }]);
    // Adding with another user's id is refused on the primary key, and adds nothing.
    const taken = await savePlace(user.db, othersPlace, "Annexet", "add");
    expect(taken.error?.code).toBe("23505");
    expect(taken.error?.message).toContain("pantry_site_pkey");
    expect(await sitesOf(user.id)).toHaveLength(2);
  });

  it("refuses a name another of the caller's places has, whatever the case, and the table's checks", async () => {
    const { user, stugan } = await twoPlaces("pantry-site-save-duplicate");
    const duplicate = await savePlace(user.db, randomUUID(), "STUGAN", "add");
    expect(duplicate.error?.code).toBe("23505");
    expect(duplicate.error?.message).toContain("pantry_site_user_id_normalized_name_key");
    expect((await savePlace(user.db, stugan, "Hemma", "rename")).error?.code).toBe("23505");
    // A forged call with a name the domain would refuse meets the table's checks.
    const forged = await user.db.rpc("save_pantry_site", {
      site_id: randomUUID(),
      site_name: "a".repeat(41),
      site_normalized_name: "a".repeat(41),
      mode: "add",
    });
    expect(forged.error?.code).toBe("23514");
    expect(await sitesOf(user.id)).toHaveLength(2);
  });

  it("refuses missing values and an unknown mode", async () => {
    const user = await createTestUser("pantry-site-save-invalid");
    const id = randomUUID();
    const calls = [
      user.db.rpc("save_pantry_site", { site_id: id, site_name: "Stugan", site_normalized_name: "stugan", mode: "change" }),
      user.db.rpc("save_pantry_site", { site_id: id, site_name: null as unknown as string, site_normalized_name: "stugan", mode: "add" }),
      user.db.rpc("save_pantry_site", { site_id: null as unknown as string, site_name: "Stugan", site_normalized_name: "stugan", mode: "add" }),
    ];
    for (const [index, call] of calls.entries()) expect((await call).error?.code, `call ${index}`).toBe("22023");
  });

  it(`gives MK422 for place ${maxSites + 1}, through the function and through a direct insert`, async () => {
    const user = await createTestUser("pantry-site-limit");
    expect((await user.db.rpc("ensure_pantry_defaults")).error).toBeNull();
    for (let index = 2; index <= maxSites; index += 1) {
      expect((await savePlace(user.db, randomUUID(), `Ställe ${index}`, "add")).error, `place ${index}`).toBeNull();
    }
    expect(await sitesOf(user.id)).toHaveLength(maxSites);

    expect((await savePlace(user.db, randomUUID(), "Elfte", "add")).error?.code).toBe("MK422");
    const direct = await user.db.from("pantry_site").insert({ name: "Elfte", normalized_name: "elfte" });
    expect(direct.error?.code).toBe("MK422");
    const admin = await adminClient().from("pantry_site").insert({ user_id: user.id, name: "Elfte", normalized_name: "elfte" });
    expect(admin.error?.code).toBe("MK422");
    // A rename is no new place.
    const [, second] = await sitesOf(user.id);
    expect((await savePlace(user.db, second.id, "Andra", "rename")).error).toBeNull();
    expect(await sitesOf(user.id)).toHaveLength(maxSites);
  });

  it("gives the data layer's outcomes: saved, name_taken, limit, gone", async () => {
    const { user, stugan } = await twoPlaces("pantry-site-save-outcomes");
    const id = randomUUID();
    expect(await saveSiteIn(user.db, siteForm(id, " Torpet ", "add"))).toEqual({
      kind: "saved",
      site: { id, name: "Torpet", isSelected: false },
    });
    expect(await saveSiteIn(user.db, siteForm(randomUUID(), " STUGAN ", "add"))).toEqual({ kind: "name_taken", name: "Stugan" });
    expect(await saveSiteIn(user.db, siteForm(madeUpId, "Annexet", "rename"))).toEqual({ kind: "gone" });
    for (let index = 4; index <= maxSites; index += 1) await saveSiteIn(user.db, siteForm(randomUUID(), `Ställe ${index}`, "add"));
    expect(await saveSiteIn(user.db, siteForm(randomUUID(), "Elfte", "add"))).toEqual({ kind: "limit" });
    expect(await saveSiteIn(user.db, siteForm(stugan, "Stugan", "rename"))).toMatchObject({ kind: "saved" });
    await expect(saveSiteIn(anonClient(), siteForm(randomUUID(), "Annexet", "add"))).rejects.toThrow(
      new PantryDataError("failed 42501"),
    );
  });
});

describe("select_pantry_site", () => {
  it("selects the place, clears the others, and leaves exactly one selected", async () => {
    const { user, hemma, stugan } = await twoPlaces("pantry-site-select");
    const selected = await user.db.rpc("select_pantry_site", { site_id: stugan });
    expect(selected.error).toBeNull();
    expect(selected.data).toMatchObject({ id: stugan, is_selected: true });
    expect(await sitesOf(user.id)).toMatchObject([
      { id: hemma, is_selected: false },
      { id: stugan, is_selected: true },
    ]);
    // Selecting the selected place changes nothing.
    expect((await user.db.rpc("select_pantry_site", { site_id: stugan })).error).toBeNull();
    expect((await sitesOf(user.id)).filter((site) => site.is_selected).map((site) => site.id)).toEqual([stugan]);

    expect(await selectSiteIn(user.db, hemma)).toEqual({ kind: "selected", site: { id: hemma, name: "Hemma", isSelected: true } });
    expect(await selectSiteIn(user.db, madeUpId)).toEqual({ kind: "gone" });
  });

  it("runs two selections at once one after the other: exactly one place is selected after", async () => {
    const { user, hemma, stugan } = await twoPlaces("pantry-site-select-race");
    const torpet = await addSite(user.id, "Torpet");
    for (let round = 0; round < 5; round += 1) {
      const answers = await Promise.all([
        user.db.rpc("select_pantry_site", { site_id: stugan }),
        user.db.rpc("select_pantry_site", { site_id: torpet }),
        user.db.rpc("select_pantry_site", { site_id: hemma }),
      ]);
      expect(answers.map((answer) => answer.error)).toEqual([null, null, null]);
      expect((await sitesOf(user.id)).filter((site) => site.is_selected)).toHaveLength(1);
    }
  });

  it("gives MK410 for another user's place, and changes nothing", async () => {
    const { user, hemma } = await twoPlaces("pantry-site-select-other");
    const other = await createTestUser("pantry-site-select-other-other");
    const othersPlace = await addSite(other.id, "Torpet", true);
    expect((await user.db.rpc("select_pantry_site", { site_id: othersPlace })).error?.code).toBe("MK410");
    expect((await sitesOf(user.id)).filter((site) => site.is_selected).map((site) => site.id)).toEqual([hemma]);
    expect(await sitesOf(other.id)).toMatchObject([{ id: othersPlace, is_selected: true }]);
  });
});

describe("delete_pantry_site", () => {
  it("refuses the selected place, a place with items and the last place (MK423), and deletes an empty one", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-delete");
    const torpet = await addSite(user.id, "Torpet");
    await seed(user.id, [{ site_id: torpet, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);

    expect((await user.db.rpc("delete_pantry_site", { site_id: hemma })).error?.code).toBe("MK423");
    expect((await user.db.rpc("delete_pantry_site", { site_id: torpet })).error?.code).toBe("MK423");
    const deleted = await user.db.rpc("delete_pantry_site", { site_id: stugan });
    expect(deleted.error).toBeNull();
    expect(deleted.data).toBe(true);
    // Gone already, or never the caller's: false, and nothing changes.
    expect((await user.db.rpc("delete_pantry_site", { site_id: stugan })).data).toBe(false);
    expect((await user.db.rpc("delete_pantry_site", { site_id: madeUpId })).data).toBe(false);
    expect((await sitesOf(user.id)).map((site) => site.id)).toEqual([hemma, torpet]);

    const alone = await createTestUser("pantry-site-delete-last");
    expect((await alone.db.rpc("ensure_pantry_defaults")).error).toBeNull();
    const [only] = await sitesOf(alone.id);
    expect((await alone.db.rpc("delete_pantry_site", { site_id: only.id })).error?.code).toBe("MK423");
    expect(await sitesOf(alone.id)).toHaveLength(1);
  });

  it("never deletes another user's place", async () => {
    const user = await createTestUser("pantry-site-delete-other");
    const other = await createTestUser("pantry-site-delete-other-other");
    await addSite(other.id, "Hemma", true);
    const othersPlace = await addSite(other.id, "Stugan");
    expect((await user.db.rpc("delete_pantry_site", { site_id: othersPlace })).data).toBe(false);
    expect(await sitesOf(other.id)).toHaveLength(2);
  });

  it("keeps a removal record whose rows were on the place, and its Ångra skips them", async () => {
    const { user, stugan, mjolk } = await twoPlaces("pantry-site-delete-removal");
    await seed(user.id, [{ site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const operation = randomUUID();
    expect((await user.db.rpc("empty_pantry_place", { place: "Kyl", operation_id: operation, site: stugan })).error).toBeNull();
    expect((await user.db.rpc("delete_pantry_site", { site_id: stugan })).data).toBe(true);
    const undone = await user.db.rpc("restore_pantry_removal", { operation_id: operation });
    expect(undone.data).toEqual({ restored: [], skipped: 1 });
  });

  it("gives the data layer's outcomes: deleted, in_use", async () => {
    const { user, hemma, stugan } = await twoPlaces("pantry-site-delete-outcomes");
    expect(await deleteSiteIn(user.db, hemma)).toEqual({ kind: "in_use" });
    expect(await deleteSiteIn(user.db, stugan)).toEqual({ kind: "deleted", removed: true });
    expect(await deleteSiteIn(user.db, stugan)).toEqual({ kind: "deleted", removed: false });
  });
});

describe("Hemma's reads and writes on a chosen place (Story 8.2)", () => {
  it("counts the items per place in one query, and the server lists the places with their counts", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-counts");
    const torpet = await addSite(user.id, "Torpet");
    await seed(user.id, [
      { site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: hemma, ingredient_id: mjolk, location: "Frys", amount: 1, unit: "l" },
      { site_id: stugan, ingredient_id: mjolk, location: "Skafferi", amount: 2, unit: "l" },
    ]);
    // One grouped query, of the user's own rows only; a place without items has no count.
    const other = await createTestUser("pantry-site-counts-other");
    await seed(other.id, [{ site_id: await addSite(other.id, "Hemma", true), ingredient_id: await addIngredient(other.db, uniqueName("Mjölk")), location: "Kyl" }]);
    expect(await loadSiteItemCountsIn(user.db)).toEqual({ [hemma]: 2, [stugan]: 1 });
    await expect(loadSiteItemCountsIn(anonClient())).rejects.toThrow(new PantryDataError("query_failed 42501"));

    sessionDb = user.db;
    expect(await pantryServer.listPantrySitesWithCounts()).toEqual([
      { id: hemma, name: "Hemma", isSelected: true, itemCount: 2 },
      { id: stugan, name: "Stugan", isSelected: false, itemCount: 1 },
      { id: torpet, name: "Torpet", isSelected: false, itemCount: 0 },
    ]);
  });

  it("gives site_gone, never an empty pantry, for a read of a place that is gone or another user's", async () => {
    const { user, stugan } = await twoPlaces("pantry-site-read-gone");
    const other = await createTestUser("pantry-site-read-gone-other");
    const othersPlace = await addSite(other.id, "Torpet", true);
    sessionDb = user.db;
    for (const site of [othersPlace, madeUpId]) {
      await expect(pantryServer.listPantry("Kyl", site)).rejects.toThrow(new PantryDataError("site_gone"));
      await expect(pantryServer.countPantryItems(site)).rejects.toThrow(new PantryDataError("site_gone"));
      await expect(pantryServer.getPantrySnapshot(site)).rejects.toThrow(new PantryDataError("site_gone"));
    }
    expect(await pantryServer.countPantryItems(stugan)).toEqual({ Kyl: 0, Frys: 0, Skafferi: 0 });
  });

  it("saves on the place sent, also with the row being changed, and MK410 for a place that is gone", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-write-sent");
    const [row] = await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }], null, stugan);
    expect(await onSite(user.id, stugan)).toEqual([{ ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    expect(await onSite(user.id, hemma)).toEqual([]);

    // Hemma is selected; the sheet opened on Stugan moves the row there, on Stugan.
    await setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Frys", amount: 1, unit: "l" }], row!.id, stugan);
    expect(await onSite(user.id, stugan)).toEqual([{ ingredient_id: mjolk, location: "Frys", amount: 1, unit: "l" }]);
    expect(await onSite(user.id, hemma)).toEqual([]);

    await expect(
      setPantryItemsIn(user.db, [{ ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }], null, madeUpId),
    ).rejects.toThrow(new PantryDataError("site_gone"));
  });

  it("puts a removed row back on its own place after another is selected, and MK410 when that place is gone", async () => {
    const { user, hemma, stugan, mjolk } = await twoPlaces("pantry-site-restore-sent");
    await selectSiteIn(user.db, stugan);
    const [id] = await seed(user.id, [{ site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    const removed = await user.db.from("pantry_item").delete().eq("id", id!).select("id").single();
    expect(removed.error).toBeNull();
    await selectSiteIn(user.db, hemma);

    const restored = await restorePantryItemIn(user.db, {
      id: id!,
      siteId: stugan,
      ingredientId: mjolk,
      location: "Kyl",
      amount: 1,
      unit: "l",
    });
    expect(restored).toMatchObject({ id, siteId: stugan });
    expect(await onSite(user.id, hemma)).toEqual([]);

    await user.db.from("pantry_item").delete().eq("id", id!);
    await expect(
      restorePantryItemIn(user.db, { id: id!, siteId: madeUpId, ingredientId: mjolk, location: "Kyl", amount: 1, unit: "l" }),
    ).rejects.toThrow(new PantryDataError("site_gone"));
  });
});

describe("photo, inventory and emptying on a place (Story 8.4)", () => {
  /** Milk in the fridge on both places, yoghurt at home and mustard (unlimited) in Stugan. */
  async function stocked(name: string) {
    const places = await twoPlaces(name);
    const { user, hemma, stugan, mjolk } = places;
    const yoghurt = await addIngredient(user.db, uniqueName("Yoghurt"));
    const senap = await addIngredient(user.db, uniqueName("Senap"));
    const [hemmaMjolk, hemmaYoghurt, stuganMjolk, stuganSenap] = await seed(user.id, [
      { site_id: hemma, ingredient_id: mjolk, location: "Kyl", amount: 1, unit: "l" },
      { site_id: hemma, ingredient_id: yoghurt, location: "Kyl", amount: 2, unit: "förp" },
      { site_id: stugan, ingredient_id: mjolk, location: "Kyl", amount: 2, unit: "förp" },
      { site_id: stugan, ingredient_id: senap, location: "Kyl" },
    ]);
    return { ...places, yoghurt, senap, hemmaMjolk: hemmaMjolk!, hemmaYoghurt: hemmaYoghurt!, stuganMjolk: stuganMjolk!, stuganSenap: stuganSenap! };
  }

  it("applyPantryInventoryIn changes, replaces and removes only on the place sent, and skips the other place's ids", async () => {
    const s = await stocked("pantry-site-photo-inventory");
    const hemmaBefore = await stateOf(s.user.id).then((rows) => rows.filter((row) => row.site_id === s.hemma));
    const operation = randomUUID();

    const applied = await applyPantryInventoryIn(s.user.db, {
      siteId: s.stugan,
      place: "Kyl",
      items: [{ ingredientId: s.mjolk, location: "Kyl", amount: 1, unit: "l" }],
      // Forged: Hemma's rows next to Stugan's.
      replaceRowIds: [s.stuganMjolk, s.hemmaMjolk],
      removeRowIds: [s.stuganSenap, s.hemmaYoghurt],
      operationId: operation,
    });
    expect(applied).toMatchObject({ replaced: 1, removedCount: 1, undoable: 1, unreadable: false });
    expect(applied.set).toEqual([expect.objectContaining({ siteId: s.stugan, ingredientId: s.mjolk, amount: 1, unit: "l" })]);
    expect(applied.removed).toEqual([expect.objectContaining({ id: s.stuganSenap, siteId: s.stugan })]);
    expect(await onSite(s.user.id, s.stugan)).toEqual([{ ingredient_id: s.mjolk, location: "Kyl", amount: 1, unit: "l" }]);
    // Hemma's rows keep their ids, amounts and units.
    expect((await stateOf(s.user.id)).filter((row) => row.site_id === s.hemma)).toEqual(hemmaBefore);

    // The record for Ångra has the place on every row.
    const { data: record } = await adminClient().from("pantry_removal").select("removed_rows").eq("id", operation).single();
    expect(record?.removed_rows).toEqual([expect.objectContaining({ id: s.stuganSenap, site_id: s.stugan })]);
  });

  it("emptyPantryPlaceIn empties only the place sent, a replay gives the same record, and Ångra puts the rows back there", async () => {
    const s = await stocked("pantry-site-photo-empty");
    const operation = randomUUID();
    const emptied = await emptyPantryPlaceIn(s.user.db, "Kyl", operation, s.stugan);
    expect(emptied).toEqual({ removed: 2, removedIds: [s.stuganMjolk, s.stuganSenap].sort() });
    expect(await onSite(s.user.id, s.stugan)).toEqual([]);
    expect(await onSite(s.user.id, s.hemma)).toHaveLength(2);
    expect(await emptyPantryPlaceIn(s.user.db, "Kyl", operation, s.stugan)).toEqual(emptied);
    // The same id for another place is refused (MK409), and nothing more is removed.
    await expect(emptyPantryPlaceIn(s.user.db, "Kyl", operation, s.hemma)).rejects.toThrow(new PantryDataError("empty_failed MK409"));
    expect(await onSite(s.user.id, s.hemma)).toHaveLength(2);

    // Hemma stays selected: "Ångra" puts the rows back on Stugan with the same ids.
    const restored = await restorePantryRemovalIn(s.user.db, operation);
    expect(restored.skipped).toBe(0);
    expect(restored.restoredIds.sort()).toEqual([s.stuganMjolk, s.stuganSenap].sort());
    expect(restored.rows.every((row) => row.siteId === s.stugan)).toBe(true);
    const back = (await stateOf(s.user.id)).filter((row) => row.site_id === s.stugan).map((row) => row.id);
    expect(back.sort()).toEqual([s.stuganMjolk, s.stuganSenap].sort());
  });

  it("restorePantryRemovalIn skips the rows of a place deleted since", async () => {
    const s = await stocked("pantry-site-photo-restore-gone");
    const operation = randomUUID();
    await emptyPantryPlaceIn(s.user.db, "Kyl", operation, s.stugan);
    expect(await deleteSiteIn(s.user.db, s.stugan)).toMatchObject({ kind: "deleted" });
    expect(await restorePantryRemovalIn(s.user.db, operation)).toEqual({ restoredIds: [], rows: [], skipped: 2 });
    expect(await onSite(s.user.id, s.hemma)).toHaveLength(2);
  });

  it("gives site_gone for another user's place or a deleted one, and writes nothing", async () => {
    const s = await stocked("pantry-site-photo-foreign");
    const other = await twoPlaces("pantry-site-photo-foreign-other");
    const before = await stateOf(s.user.id);
    await expect(
      applyPantryInventoryIn(s.user.db, {
        siteId: other.stugan,
        place: "Kyl",
        items: [{ ingredientId: s.mjolk, location: "Kyl", amount: 1, unit: "l" }],
        replaceRowIds: [],
        removeRowIds: [s.hemmaYoghurt],
        operationId: randomUUID(),
      }),
    ).rejects.toThrow(new PantryDataError("site_gone"));
    await expect(emptyPantryPlaceIn(s.user.db, "Kyl", randomUUID(), other.stugan)).rejects.toThrow(
      new PantryDataError("site_gone"),
    );
    await expect(
      setPantryItemsIn(s.user.db, [{ ingredientId: s.mjolk, location: "Kyl", amount: 1, unit: "l" }], null, madeUpId),
    ).rejects.toThrow(new PantryDataError("site_gone"));
    expect(await stateOf(s.user.id)).toEqual(before);
    expect(await onSite(other.user.id, other.stugan)).toEqual([]);
  });

  it("runs an inventory on one place and an emptying on the other at once, one after the other (pantry_lock)", async () => {
    const s = await stocked("pantry-site-photo-concurrent");
    const [applied, emptied] = await Promise.all([
      applyPantryInventoryIn(s.user.db, {
        siteId: s.stugan,
        place: "Kyl",
        items: [{ ingredientId: s.mjolk, location: "Kyl", amount: 3, unit: "förp" }],
        replaceRowIds: [],
        removeRowIds: [s.stuganSenap],
        operationId: randomUUID(),
      }),
      emptyPantryPlaceIn(s.user.db, "Kyl", randomUUID(), s.hemma),
    ]);
    expect(applied).toMatchObject({ removedCount: 1, set: [expect.objectContaining({ siteId: s.stugan, amount: 3 })] });
    expect(emptied.removed).toBe(2);
    expect(await onSite(s.user.id, s.hemma)).toEqual([]);
    expect(await onSite(s.user.id, s.stugan)).toEqual([{ ingredient_id: s.mjolk, location: "Kyl", amount: 3, unit: "förp" }]);
  });
});

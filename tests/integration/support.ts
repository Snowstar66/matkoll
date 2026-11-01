import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localSupabaseUrl } from "../local-supabase";

// Shared by the integration tests against local Supabase. The service role is
// allowed in tests (AD-4); it creates and removes the test users and checks
// rows behind RLS's back. Every address is unique to this run.

export type Db = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];
/** The tables whose rows belong to a user (`id` and `user_id`); app_owner (Story 20.3) is the one that does not. */
export type TableName = { [K in keyof Tables]: Tables[K]["Row"] extends { id: string; user_id: string | null } ? K : never }[keyof Tables];
export type TestUser = { id: string; email: string; db: Db };

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds = new Set<string>();

let admin: Db | undefined;

function keys() {
  const url = localSupabaseUrl();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!publishableKey || !serviceKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY (pnpm db:start && pnpm db:env)");
  }
  return { url, publishableKey, serviceKey };
}

/** Service role client: bypasses RLS. Only for setup, cleanup and checks. */
export function adminClient(): Db {
  const { url, serviceKey } = keys();
  admin ??= createClient<Database>(url, serviceKey, options);
  return admin;
}

/** A client without a session: the `anon` role. */
export function anonClient(): Db {
  const { url, publishableKey } = keys();
  return createClient<Database>(url, publishableKey, options);
}

/** A unique address for this run. */
export function testEmail(name: string): string {
  return `${name}-${run}@matkoll.test`;
}

/**
 * Creates a user with the service role and signs in as them the way the app
 * does: a magic link token from generateLink, exchanged with verifyOtp. The
 * returned client carries that user's session. Removed by deleteTestUsers.
 */
export async function createTestUser(name: string): Promise<TestUser> {
  const email = testEmail(name);
  const created = await adminClient().auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  createdUserIds.add(id);

  const link = await adminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const db = anonClient();
  const verified = await db.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "email" });
  if (verified.error) throw verified.error;
  return { id, email, db };
}

/**
 * Deletes every user createTestUser made; their rows go with them (on delete
 * cascade). A user a test has already deleted is skipped.
 */
export async function deleteTestUsers(): Promise<void> {
  for (const id of createdUserIds) {
    const { error } = await adminClient().auth.admin.deleteUser(id);
    if (error && error.code !== "user_not_found") throw error;
    createdUserIds.delete(id);
  }
}

/**
 * One SQL statement against local Postgres as the superuser, through the
 * Supabase CLI (a dev dependency, also in CI): for what PostgREST cannot
 * show, such as information_schema and pg_policies. Its rows; throws, with
 * Postgres's message, when the statement fails.
 */
export function localSql<Row>(statement: string): Row[] {
  const out = execFileSync("node_modules/.bin/supabase", ["db", "query", "--local", "-o", "json", statement], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // The rows come as a plain JSON array, or wrapped as { rows } when the CLI detects an AI agent in its environment.
  const json = JSON.parse(out.trim()) as Row[] | { rows?: Row[] };
  const rows = Array.isArray(json) ? json : json.rows;
  if (!Array.isArray(rows)) throw new Error(`supabase db query gave no rows: ${out.slice(0, 500)}`);
  return rows;
}

/** The household of `userId` (Story 21.2a: every account has one, made with the account). */
export async function householdOf(userId: string): Promise<string> {
  const { data, error } = await adminClient().from("household_member").select("household_id").eq("user_id", userId).single();
  if (error) throw error;
  return data.household_id;
}

/**
 * Moves `user` into the household `householdId` with the service role, the
 * way Story 21.2b's invitation will: the old membership goes (and with it the
 * old household, when it has no member left), the new one comes.
 */
export async function moveToHousehold(user: TestUser, householdId: string, role: "owner" | "member" = "member"): Promise<void> {
  const admin = adminClient();
  const removed = await admin.from("household_member").delete().eq("user_id", user.id);
  if (removed.error) throw removed.error;
  const added = await admin
    .from("household_member")
    .insert({ household_id: householdId, user_id: user.id, role, display_name: "Medlem", color: role === "owner" ? "mint" : "sky" });
  if (added.error) throw added.error;
}

/** Number of rows in `table` that belong to `userId`, counted with the service role. */
export async function countRows(table: TableName, userId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

type Attempt = { data: unknown; error: { code?: string } | null };

/**
 * Denied: `42501` (no grant or RLS), or for a signed-in user also no rows read
 * or touched (RLS filters them out). The anonymous client must always get
 * `42501`, so a grant to anon cannot hide behind an empty result.
 */
function expectDenied(attempt: Attempt, what: string, requireError: boolean) {
  if (requireError || attempt.error) {
    expect(attempt.error?.code, what).toBe("42501");
  } else {
    expect(attempt.data ?? [], what).toEqual([]);
  }
}

async function adminRow(table: TableName, id: string) {
  const { data, error } = await adminClient().from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Shows that a table's rows are isolated per user (AD-4): neither an anonymous
 * client nor another signed-in user can read, create, change or delete the
 * owner's rows. The anonymous client must be refused outright (`42501`); for
 * the other user an empty result also counts. `insertRow` returns the payload for one row, created with the
 * owner's client (it may create parent rows first through the same client).
 */
export async function expectRlsIsolation(
  table: TableName,
  insertRow: (owner: Db) => Promise<Record<string, unknown>>,
): Promise<void> {
  const owner = await createTestUser(`${table}-owner`);
  const other = await createTestUser(`${table}-other`);

  // The owner can create and read their own row.
  const payload = await insertRow(owner.db);
  const inserted = await owner.db
    .from(table)
    .insert(payload as never)
    .select("*")
    .single();
  expect(inserted.error, "owner inserts").toBeNull();
  const row = inserted.data as unknown as { id: string; user_id: string };
  expect(row.user_id).toBe(owner.id);
  const own = await owner.db.from(table).select("id").eq("id", row.id);
  expect(own.data, "owner reads").toHaveLength(1);

  const before = await adminRow(table, row.id);
  const ownerRows = await countRows(table, owner.id);
  const intruders: [string, Db, boolean][] = [
    ["anon", anonClient(), true],
    ["another user", other.db, false],
  ];

  for (const [who, db, requireError] of intruders) {
    expectDenied(await db.from(table).select("*").eq("id", row.id), `${who} reads`, requireError);
    expectDenied(await db.from(table).select("*").eq("user_id", owner.id), `${who} lists`, requireError);

    const insert = await db
      .from(table)
      .insert({ ...payload, user_id: owner.id } as never)
      .select("id");
    expect(insert.error?.code, `${who} inserts a row for the owner`).toBe("42501");

    expectDenied(
      await db
        .from(table)
        .update({ created_at: "2000-01-01T00:00:00Z" } as never)
        .eq("id", row.id)
        .select("id"),
      `${who} updates`,
      requireError,
    );
    expectDenied(await db.from(table).delete().eq("id", row.id).select("id"), `${who} deletes`, requireError);
  }

  // Nothing changed behind RLS.
  expect(await adminRow(table, row.id), "row unchanged").toEqual(before);
  expect(await countRows(table, owner.id), "no rows added for the owner").toBe(ownerRows);
}

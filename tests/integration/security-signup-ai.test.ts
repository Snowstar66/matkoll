import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, localSql, moveToHousehold, testEmail, type Db, type TestUser } from "./support";

// Security review 2026-11-11, against local Supabase with the sign-up hook on (config.toml):
// S-09: household_signup_hook lets a household code make at most household_signup_limit() (3)
//   accounts, never one for an address on the owner's allow list (app_invite), and still lets the
//   invited person through. Sign-ups go through Supabase Auth's own endpoint, the way an attacker
//   with the publishable key would call it, not through the app.
// S-07: ai_setting is written only by the app's owner through set_ai_setting/clear_ai_setting; a
//   member of the owner's household, another household and anon are refused (42501), and reading
//   the choice works as before.

/** Users made with a sign-up here (not createTestUser), deleted in afterAll. */
const signedUp = new Set<string>();
/** Every user of this file, whose households afterAll deletes. */
const touched = new Set<string>();

function freshClient(): Db {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A sign-up straight to Supabase Auth, with `metadata` as user_metadata. */
async function signUp(email: string, metadata?: Record<string, string>) {
  const db = freshClient();
  const result = await db.auth.signUp({ email, password: "hemligt-lösen-123", options: metadata ? { data: metadata } : undefined });
  if (result.data.user) {
    signedUp.add(result.data.user.id);
    touched.add(result.data.user.id);
  }
  return { db, email, result };
}

async function newUser(name: string): Promise<TestUser> {
  const made = await createTestUser(name);
  touched.add(made.id);
  return made;
}

async function householdInvite(user: TestUser) {
  const made = await user.db.rpc("create_household_invite");
  expect(made.error).toBeNull();
  return made.data![0]!;
}

async function signupCount(inviteId: string): Promise<number> {
  const { data, error } = await adminClient().from("household_invite").select("signup_count").eq("id", inviteId).single();
  if (error) throw error;
  return data.signup_count;
}

async function accountExists(email: string): Promise<boolean> {
  return localSql<{ n: number }>(`select count(*)::int as n from auth.users where email = '${email.replaceAll("'", "''")}'`)[0]!.n > 0;
}

/** The hook as Supabase Auth calls it, with a hand-made event (run as postgres by the CLI). */
function hook(event: unknown): unknown {
  const literal = JSON.stringify(event).replaceAll("'", "''");
  return localSql<{ answer: unknown }>(`select public.household_signup_hook('${literal}'::jsonb) as answer`)[0]!.answer;
}

const refused = { error: { http_code: 403, message: "Inbjudan gäller inte längre." } };

let appOwner: TestUser;
let familyMember: TestUser;
let ownerHousehold: string;
let inviter: TestUser;

beforeAll(async () => {
  appOwner = await newUser("sec-app-owner");
  familyMember = await newUser("sec-family");
  ownerHousehold = await householdOf(appOwner.id);
  await moveToHousehold(familyMember, ownerHousehold);
  expect((await adminClient().from("app_owner").upsert({ user_id: appOwner.id })).error).toBeNull();
  inviter = await newUser("sec-inviter");
});

afterAll(async () => {
  await adminClient().from("app_owner").delete().eq("user_id", appOwner.id);
  await adminClient().from("app_invite").delete().like("email", "sec-%");
  const { data } = await adminClient().from("household_member").select("household_id, user_id");
  for (const household of new Set((data ?? []).filter((row) => touched.has(row.user_id)).map((row) => row.household_id))) {
    await adminClient().from("household").delete().eq("id", household);
  }
  for (const id of signedUp) await adminClient().auth.admin.deleteUser(id);
  await deleteTestUsers();
});

describe("S-09: the sign-up hook with a household code", () => {
  it("lets the invited person through, who then joins the household and uses the code up", async () => {
    const made = await householdInvite(inviter);
    const joiner = await signUp(testEmail("sec-joiner"), { invite_code: made.code });
    expect(joiner.result.error).toBeNull();
    expect(joiner.result.data.session).not.toBeNull();
    expect(await signupCount(made.id)).toBe(1);
    expect((await joiner.db.rpc("accept_household_invite", { code: made.code })).data).toHaveLength(1);
    expect(await householdOf(joiner.result.data.user!.id)).toBe(await householdOf(inviter.id));
    // Used: no more sign-ups with it.
    expect((await signUp(testEmail("sec-after-use"), { invite_code: made.code })).result.error?.status).toBe(403);
  });

  it("lets at most 3 accounts through with one code, and refuses the 4th without making it", async () => {
    const made = await householdInvite(inviter);
    for (const n of [1, 2, 3]) {
      const { result } = await signUp(testEmail(`sec-limit-${n}`), { invite_code: made.code });
      expect(result.error, `sign-up ${n}`).toBeNull();
    }
    expect(await signupCount(made.id)).toBe(3);
    const fourth = await signUp(testEmail("sec-limit-4"), { invite_code: made.code });
    expect(fourth.result.error?.status).toBe(403);
    expect(fourth.result.error?.message).toBe("Inbjudan gäller inte längre.");
    expect(fourth.result.data.user).toBeNull();
    expect(await accountExists(fourth.email)).toBe(false);
    expect(await signupCount(made.id)).toBe(3);
    // The code itself still works for joining (by one of the three), so the family is not locked out.
    expect((await adminClient().from("household_invite").select("used_at").eq("id", made.id).single()).data?.used_at).toBeNull();
  });

  it("never lets two sign-ups at once take the last place", async () => {
    const made = await householdInvite(inviter);
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => signUp(testEmail(`sec-race-${n}-${randomUUID().slice(0, 4)}`), { invite_code: made.code })));
    expect(results.filter(({ result }) => result.error === null)).toHaveLength(3);
    expect(results.filter(({ result }) => result.error?.status === 403)).toHaveLength(2);
    expect(await signupCount(made.id)).toBe(3);
  });

  it("refuses an address on the owner's allow list (app_invite), whatever its case, and lets it in with its own code", async () => {
    const email = testEmail("sec-listed");
    const appInvite = await appOwner.db.rpc("create_app_invite", { invite_email: email });
    expect(appInvite.error).toBeNull();
    const made = await householdInvite(inviter);
    for (const spelling of [email, email.toUpperCase()]) {
      const { result } = await signUp(spelling, { invite_code: made.code });
      expect(result.error?.status, spelling).toBe(403);
      expect(result.data.user).toBeNull();
    }
    expect(await accountExists(email)).toBe(false);
    expect(await signupCount(made.id), "a refused address takes no place").toBe(0);
    // The household code with the app invitation's key is no app invitation either.
    expect((await signUp(email, { app_invite_code: made.code })).result.error?.status).toBe(403);
    // The owner's normal flow: the address makes its account with its own invitation.
    const own = await signUp(email, { app_invite_code: appInvite.data![0]!.code });
    expect(own.result.error).toBeNull();
    expect((await own.db.rpc("claim_app_invite", { code: appInvite.data![0]!.code })).data).toBe(true);
  });

  it("refuses no code, an unknown, a revoked and an expired code, and counts none of them", async () => {
    for (const code of [undefined, "", "ZZZZZZ", "K7Q4MP"]) {
      const { result } = await signUp(testEmail(`sec-bad-${randomUUID().slice(0, 6)}`), code === undefined ? undefined : { invite_code: code });
      expect(result.error?.status, `code ${code}`).toBe(403);
      expect(result.data.user).toBeNull();
    }
    const revoked = await householdInvite(inviter);
    await inviter.db.rpc("revoke_household_invite", { invite_id: revoked.id });
    expect((await signUp(testEmail("sec-revoked"), { invite_code: revoked.code })).result.error?.status).toBe(403);
    const expired = await householdInvite(inviter);
    await adminClient().from("household_invite").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", expired.id);
    expect((await signUp(testEmail("sec-expired"), { invite_code: expired.code })).result.error?.status).toBe(403);
    expect(await signupCount(revoked.id)).toBe(0);
    expect(await signupCount(expired.id)).toBe(0);
  });

  it("answers a malformed event with a refusal, never with a pass or an error", async () => {
    const made = await householdInvite(inviter);
    for (const event of [{}, { user: null }, { user: "x" }, { user: { email: null, user_metadata: null } }, { user: { user_metadata: { invite_code: made.code } } }, { user: { email: "", user_metadata: { invite_code: made.code } } }, { user: { email: 42, user_metadata: { invite_code: 42 } } }]) {
      expect(hook(event), JSON.stringify(event)).toEqual(refused);
    }
    expect(await signupCount(made.id)).toBe(0);
    // A well-formed one passes and counts.
    expect(hook({ user: { email: testEmail("sec-direct"), user_metadata: { invite_code: made.code } } })).toEqual({});
    expect(await signupCount(made.id)).toBe(1);
  });

  it("keeps the hook and the limit as security definer with an empty search_path, the hook for Supabase Auth only", () => {
    const rows = localSql<{ name: string; anon: boolean; authenticated: boolean; auth_admin: boolean; definer: boolean; path: string }>(`
      select p.proname as name, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE') as auth_admin,
        p.prosecdef as definer, coalesce(array_to_string(p.proconfig, ','), '') as path
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('household_signup_hook', 'household_signup_limit')
      order by 1`);
    expect(rows.map((row) => row.name)).toEqual(["household_signup_hook", "household_signup_limit"]);
    const [hookRow, limitRow] = rows;
    expect(hookRow).toMatchObject({ definer: true, path: 'search_path=""', anon: false, authenticated: false, auth_admin: true });
    expect(limitRow).toMatchObject({ path: 'search_path=""', anon: false, authenticated: false, auth_admin: false });
  });
});

describe("S-07: the AI choice", () => {
  const opus = { new_provider: "anthropic", new_model: "claude-opus-5-5", new_effort: "high" };

  async function ownerRow() {
    const { data, error } = await adminClient().from("ai_setting").select("provider, model, effort, user_id").eq("household_id", ownerHousehold);
    if (error) throw error;
    return data;
  }

  it("lets the app's owner save and clear it through the functions, and the household reads it", async () => {
    expect((await appOwner.db.rpc("set_ai_setting", { new_provider: "anthropic", new_model: "claude-haiku-5-5", new_effort: "low" })).error).toBeNull();
    expect(await ownerRow()).toEqual([{ provider: "anthropic", model: "claude-haiku-5-5", effort: "low", user_id: appOwner.id }]);
    expect((await familyMember.db.from("ai_setting").select("model")).data, "a member reads the household's choice").toEqual([{ model: "claude-haiku-5-5" }]);
    expect((await appOwner.db.rpc("clear_ai_setting")).data).toBe(true);
    expect(await ownerRow()).toEqual([]);
    expect((await appOwner.db.rpc("set_ai_setting", { new_provider: "anthropic", new_model: "claude-haiku-5-5", new_effort: "medium" })).error).toBeNull();
  });

  it("refuses a member of the owner's household, through PostgREST and the functions (42501)", async () => {
    const before = await ownerRow();
    expect(before).toHaveLength(1);
    const db = familyMember.db;
    expect((await db.from("ai_setting").insert({ provider: "anthropic", model: "claude-opus-5-5", effort: "high" })).error?.code).toBe("42501");
    expect((await db.from("ai_setting").update({ model: "claude-opus-5-5", effort: "high" }).eq("household_id", ownerHousehold)).error?.code).toBe("42501");
    expect((await db.from("ai_setting").upsert({ provider: "anthropic", model: "claude-opus-5-5", effort: "high" }, { onConflict: "household_id" })).error?.code).toBe("42501");
    expect((await db.from("ai_setting").delete().eq("household_id", ownerHousehold)).error?.code).toBe("42501");
    expect((await db.rpc("set_ai_setting", opus)).error?.code).toBe("42501");
    expect((await db.rpc("clear_ai_setting")).error?.code).toBe("42501");
    expect(await ownerRow()).toEqual(before);
  });

  it("refuses another household and anon, and the owner's function never writes another household", async () => {
    const other = await newUser("sec-other-household");
    const otherHousehold = await householdOf(other.id);
    const before = await ownerRow();
    expect((await other.db.from("ai_setting").insert({ provider: "anthropic", model: "claude-opus-5-5", effort: "high", household_id: ownerHousehold })).error?.code).toBe("42501");
    expect((await other.db.from("ai_setting").insert({ provider: "anthropic", model: "claude-opus-5-5", effort: "high" })).error?.code).toBe("42501");
    expect((await other.db.rpc("set_ai_setting", opus)).error?.code).toBe("42501");
    expect((await other.db.rpc("clear_ai_setting")).error?.code).toBe("42501");
    const anon = anonClient();
    expect((await anon.rpc("set_ai_setting", opus)).error?.code).toBe("42501");
    expect((await anon.rpc("clear_ai_setting")).error?.code).toBe("42501");
    expect((await anon.from("ai_setting").insert({ provider: "anthropic", model: "claude-opus-5-5", effort: "high", household_id: ownerHousehold })).error?.code).toBe("42501");
    expect(await ownerRow()).toEqual(before);
    expect((await adminClient().from("ai_setting").select("id").eq("household_id", otherHousehold)).data).toEqual([]);
  });

  it("grants authenticated only select on ai_setting, and the functions as security definer with an empty search_path", () => {
    const grants = localSql<{ privilege: string }>(`
      select privilege_type as privilege from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'ai_setting' and grantee = 'authenticated' order by 1`);
    expect(grants.map((row) => row.privilege)).toEqual(["SELECT"]);
    const rows = localSql<{ name: string; anon: boolean; authenticated: boolean; definer: boolean; path: string }>(`
      select p.proname as name, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        p.prosecdef as definer, coalesce(array_to_string(p.proconfig, ','), '') as path
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('set_ai_setting', 'clear_ai_setting')
      order by 1`);
    expect(rows).toEqual([
      { name: "clear_ai_setting", anon: false, authenticated: true, definer: true, path: 'search_path=""' },
      { name: "set_ai_setting", anon: false, authenticated: true, definer: true, path: 'search_path=""' },
    ]);
  });
});

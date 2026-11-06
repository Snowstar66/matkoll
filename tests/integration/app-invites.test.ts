import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, localSql, moveToHousehold, testEmail, type Db, type TestUser } from "./support";

// Bjud in ett hushåll från appen (Story 21.1): the owner (is_app_owner(), the table app_owner)
// invites an address and gets a code; the person signs up with it (the Before User Created
// hook), the code works for that address only, once and before it expires; access is bound to
// the user id the code was used by, so removing the invitation takes it from the person and from
// the household members who got in only through them. No client reads or writes the table, and
// nothing but the owner reaches the functions that write it. The owner here is a test user added
// to app_owner for this run and removed after it.

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const password = "hemligt-lösen-123";

let owner: TestUser;
let user: TestUser;
const signedUp = new Set<string>();
const emails: string[] = [];

function freshClient(): Db {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Signs up the way /inbjudan does: e-mail, password and the code in the metadata. */
async function signUp(email: string, code: string | undefined, key = "app_invite_code") {
  const db = freshClient();
  const result = await db.auth.signUp({ email, password, options: code === undefined ? undefined : { data: { [key]: code } } });
  if (result.data.user) signedUp.add(result.data.user.id);
  return { db, result };
}

async function invite(email: string) {
  emails.push(email);
  const made = await owner.db.rpc("create_app_invite", { invite_email: email });
  expect(made.error).toBeNull();
  return made.data![0]!;
}

async function stored(email: string) {
  const { data, error } = await adminClient().from("app_invite").select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  owner = await createTestUser("appinv-owner");
  user = await createTestUser("appinv-user");
  expect((await adminClient().from("app_owner").insert({ user_id: owner.id })).error).toBeNull();
});

afterAll(async () => {
  await adminClient().from("app_owner").delete().eq("user_id", owner.id);
  if (emails.length > 0) await adminClient().from("app_invite").delete().in("email", emails);
  const { data } = await adminClient().from("household_member").select("household_id, user_id");
  for (const household of new Set((data ?? []).filter((row) => signedUp.has(row.user_id)).map((row) => row.household_id))) {
    await adminClient().from("household").delete().eq("id", household);
  }
  for (const id of signedUp) await adminClient().auth.admin.deleteUser(id);
  await deleteTestUsers();
});

describe("who may invite", () => {
  it("lets only the owner create, list and remove invitations", async () => {
    const email = testEmail("appinv-who");
    const made = await invite(email);
    expect(made.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
    const days = (new Date(made.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect((await owner.db.rpc("app_invites")).data?.map((row) => row.id)).toContain(made.id);

    for (const [who, db] of [
      ["a user", user.db],
      ["anon", anonClient()],
    ] as const) {
      expect((await db.rpc("create_app_invite", { invite_email: testEmail("appinv-x") })).error?.code, `${who} creates`).toBe("42501");
      expect((await db.rpc("app_invites")).error?.code, `${who} lists`).toBe("42501");
      expect((await db.rpc("remove_app_invite", { invite_id: made.id })).error?.code, `${who} removes`).toBe("42501");
    }
    // A signed-in user who is not the owner is refused inside the function, and nothing changed.
    expect((await stored(email))?.id).toBe(made.id);
  });

  it("keeps only the hash of the code, and no client reads or writes the table", async () => {
    const email = testEmail("appinv-table");
    const made = await invite(email);
    const row = (await stored(email))!;
    expect(row.code_hash).toBe(sha256(made.code));
    expect(JSON.stringify(row)).not.toContain(made.code);
    for (const [who, db] of [
      ["the owner", owner.db],
      ["a user", user.db],
      ["anon", anonClient()],
    ] as const) {
      expect((await db.from("app_invite").select("*")).error?.code, `${who} reads`).toBe("42501");
      expect((await db.from("app_invite").insert({ email: testEmail("appinv-y"), code_hash: sha256("x"), expires_at: new Date().toISOString() })).error?.code, `${who} inserts`).toBe("42501");
      expect((await db.from("app_invite").update({ used_by: user.id, used_at: new Date().toISOString() }).eq("id", row.id)).error?.code, `${who} updates`).toBe("42501");
      expect((await db.from("app_invite").delete().eq("id", row.id)).error?.code, `${who} deletes`).toBe("42501");
    }
    expect(await stored(email)).toEqual(row);
  });

  it("refuses something that is not an address, and gives an unused address a new code", async () => {
    for (const bad of ["", "anna", "a b@example.se", "a@b.se, c@d.se", "@x.se"]) {
      expect((await owner.db.rpc("create_app_invite", { invite_email: bad })).error?.code, bad).toBe("22023");
    }
    const email = testEmail("appinv-again");
    const first = await invite(email);
    const second = await invite(email.toUpperCase());
    expect(second.id).toBe(first.id);
    expect(second.code).not.toBe(first.code);
    expect((await stored(email))?.code_hash).toBe(sha256(second.code));
    // The old code no longer opens a sign-up.
    expect((await signUp(email, first.code)).result.error?.status).toBe(403);
  });
});

describe("the sign-up hook", () => {
  it("refuses a sign-up without a code, with a wrong one, or with a household code's key", async () => {
    const email = testEmail("appinv-hook-no");
    const made = await invite(email);
    for (const code of [undefined, "", "ZZZZZZZZ", "K7Q4MP"]) {
      const { result } = await signUp(testEmail(`appinv-hook-${randomUUID().slice(0, 6)}`), code);
      expect(result.error?.status, `code ${code}`).toBe(403);
      expect(result.data.user).toBeNull();
    }
    // The right code for the right address under the household's key is no household code.
    expect((await signUp(email, made.code, "invite_code")).result.error?.status).toBe(403);
    expect((await signUp(email, undefined)).result.error?.status).toBe(403);
  });

  it("lets the invited address through with its code, once, and only for that address", async () => {
    const email = testEmail("appinv-hook-ok");
    const made = await invite(email);
    // Another address with the code is refused, also when it differs only in the tail.
    expect((await signUp(testEmail("appinv-hook-other"), made.code)).result.error?.status).toBe(403);
    expect((await signUp(`x${email}`, made.code)).result.error?.status).toBe(403);

    const joined = await signUp(email, made.code);
    expect(joined.result.error).toBeNull();
    expect(joined.result.data.session).not.toBeNull();
    // Not claimed yet: no access through the database.
    expect((await joined.db.rpc("app_invited_access")).data).toBe(false);

    expect((await joined.db.rpc("claim_app_invite", { code: made.code })).data).toBe(true);
    expect((await joined.db.rpc("app_invited_access")).data).toBe(true);
    const row = (await stored(email))!;
    expect(row.used_by).toBe(joined.result.data.user!.id);
    expect(row.used_at).not.toBeNull();
    // Once: a second claim, and a second sign-up with the code, fail.
    expect((await joined.db.rpc("claim_app_invite", { code: made.code })).data).toBe(false);
    expect((await signUp(email, made.code)).result.error).not.toBeNull();
    expect((await signUp(testEmail("appinv-hook-late"), made.code)).result.error?.status).toBe(403);
    expect((await anonClient().rpc("app_invite_preview", { code: made.code })).data).toMatchObject({ status: "gone" });
  });

  it("refuses an expired code, and takes a new one from the owner", async () => {
    const email = testEmail("appinv-expired");
    const made = await invite(email);
    expect((await adminClient().from("app_invite").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", made.id)).error).toBeNull();
    expect((await signUp(email, made.code)).result.error?.status).toBe(403);
    expect((await anonClient().rpc("app_invite_preview", { code: made.code })).data).toMatchObject({ status: "gone" });

    const fresh = await invite(email);
    const joined = await signUp(email, fresh.code);
    expect(joined.result.error).toBeNull();
    expect((await joined.db.rpc("claim_app_invite", { code: fresh.code })).data).toBe(true);
  });

  it("keeps the household code's behaviour: a household code still needs a household's invitation", async () => {
    const hid = await householdOf(owner.id);
    expect(hid).toBeTruthy();
    const made = await owner.db.rpc("create_household_invite");
    expect(made.error).toBeNull();
    const email = testEmail("appinv-household");
    const joined = await signUp(email, made.data![0]!.code, "invite_code");
    expect(joined.result.error).toBeNull();
    expect((await joined.db.rpc("app_invited_access")).data).toBe(false);
  });
});

describe("claiming", () => {
  it("is for the address the invitation names, and a wrong claim counts as a wrong code", async () => {
    const email = testEmail("appinv-claim");
    const made = await invite(email);
    // user (another address) cannot claim someone else's invitation.
    expect((await user.db.rpc("claim_app_invite", { code: made.code })).data).toBe(false);
    expect((await user.db.rpc("claim_app_invite", { code: "ZZZZZZZZ" })).data).toBe(false);
    expect((await stored(email))?.used_by).toBeNull();
    expect((await user.db.rpc("app_invited_access")).data).toBe(false);
    expect((await anonClient().rpc("claim_app_invite", { code: made.code })).error?.code).toBe("42501");
    await adminClient().from("household_code_attempt").delete().eq("user_id", user.id);
  });

  it("previews a code without saying whose it is", async () => {
    const email = testEmail("appinv-preview");
    const made = await invite(email);
    const preview = (await anonClient().rpc("app_invite_preview", { code: made.code })).data as Record<string, unknown>;
    expect(preview.status).toBe("ok");
    expect(JSON.stringify(preview)).not.toContain(email);
    expect((await anonClient().rpc("app_invite_preview", { code: "ZZZZZZZZ" })).data).toEqual({ status: "unknown" });
    await adminClient().from("household_code_attempt").delete().is("user_id", null);
  });
});

describe("removing an invitation", () => {
  it("takes access from the person and from the household members who got in through them", async () => {
    const email = testEmail("appinv-remove");
    const made = await invite(email);
    const joined = await signUp(email, made.code);
    expect((await joined.db.rpc("claim_app_invite", { code: made.code })).data).toBe(true);
    const joinedId = joined.result.data.user!.id;
    // A family member who got in only through the person's household (21.2b).
    const member = await createTestUser("appinv-member");
    await moveToHousehold(member, await householdOf(joinedId));
    expect((await joined.db.rpc("app_invited_access")).data).toBe(true);
    expect((await member.db.rpc("app_invited_access")).data).toBe(true);
    // The owner's own household and a stranger have nothing through them.
    expect((await user.db.rpc("app_invited_access")).data).toBe(false);

    // The invited person cannot remove it, or read the list; the owner can, and a used address is not invited again.
    const row = (await stored(email))!;
    expect((await owner.db.rpc("create_app_invite", { invite_email: email })).error?.code).toBe("MK461");
    expect((await joined.db.rpc("remove_app_invite", { invite_id: row.id })).error?.code).toBe("42501");
    expect((await joined.db.rpc("app_invite_open", { code: made.code, who: email }) as { error: { code: string } | null }).error?.code).toBe("42501");
    expect((await stored(email))?.id).toBe(row.id);

    expect((await owner.db.rpc("remove_app_invite", { invite_id: row.id })).data).toBe(true);
    expect((await owner.db.rpc("remove_app_invite", { invite_id: row.id })).data).toBe(false);
    expect(await stored(email)).toBeNull();
    expect((await joined.db.rpc("app_invited_access")).data).toBe(false);
    expect((await member.db.rpc("app_invited_access")).data).toBe(false);
    // The accounts and their data are untouched: removing takes away the way in, not the data.
    expect((await adminClient().auth.admin.getUserById(joinedId)).data.user).not.toBeNull();
    expect(await householdOf(joinedId)).toBeTruthy();
  });

  it("closes a code that was never used", async () => {
    const email = testEmail("appinv-remove-open");
    const made = await invite(email);
    const row = (await stored(email))!;
    expect((await owner.db.rpc("remove_app_invite", { invite_id: row.id })).data).toBe(true);
    expect((await signUp(email, made.code)).result.error?.status).toBe(403);
    expect((await anonClient().rpc("app_invite_preview", { code: made.code })).data).toMatchObject({ status: "unknown" });
    await adminClient().from("household_code_attempt").delete().is("user_id", null);
  });

  it("ends access when the invited account is deleted", async () => {
    const email = testEmail("appinv-deleted");
    const made = await invite(email);
    const joined = await signUp(email, made.code);
    expect((await joined.db.rpc("claim_app_invite", { code: made.code })).data).toBe(true);
    await adminClient().auth.admin.deleteUser(joined.result.data.user!.id);
    signedUp.delete(joined.result.data.user!.id);
    const row = (await stored(email))!;
    expect(row.used_by).toBeNull();
    const newcomer = await createTestUser("appinv-newcomer");
    expect((await newcomer.db.rpc("app_invited_access")).data).toBe(false);
  });
});

describe("the functions' grants", () => {
  it("give the writers to authenticated only, the preview to anon too, all security definer with an empty search path", () => {
    const rows = localSql<{ name: string; anon: boolean; authenticated: boolean; auth_admin: boolean; definer: boolean; path: string }>(`
      select p.proname as name, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE') as auth_admin,
        p.prosecdef as definer, coalesce(array_to_string(p.proconfig, ','), '') as path
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
        'create_app_invite', 'app_invites', 'remove_app_invite', 'claim_app_invite', 'app_invite_preview', 'app_invited_access',
        'app_invite_open', 'household_signup_hook')
      order by 1`);
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.definer, row.name).toBe(true);
      expect(row.path, row.name).toBe('search_path=""');
      if (row.name === "household_signup_hook") expect([row.anon, row.authenticated, row.auth_admin]).toEqual([false, false, true]);
      else if (row.name === "app_invite_open") expect([row.anon, row.authenticated, row.auth_admin]).toEqual([false, false, false]);
      else {
        expect(row.authenticated, row.name).toBe(true);
        expect(row.anon, row.name).toBe(row.name === "app_invite_preview");
      }
    }
  });

  it("has RLS on app_invite with no policy and no grant to anon or authenticated", () => {
    const [table] = localSql<{ rls: boolean; policies: number; anon: boolean; authenticated: boolean }>(`
      select c.relrowsecurity as rls,
        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = 'app_invite') as policies,
        has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE') as anon,
        has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE') as authenticated
      from pg_class c where c.oid = 'public.app_invite'::regclass`);
    expect(table).toEqual({ rls: true, policies: 0, anon: false, authenticated: false });
  });
});

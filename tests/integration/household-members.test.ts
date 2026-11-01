import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { thingPhotoBucket } from "@/features/things";
import type { Database } from "@/lib/supabase/database.types";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, localSql, testEmail, type Db, type TestUser } from "./support";

// Medlemmar och inbjudan (Story 21.2b): every function of the household, as
// the people who call it, against local Supabase with the sign-up hook on
// (config.toml). household-isolation.test.ts tries them with another
// household's ids; this file tries what each one does.

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const photoBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

/** Users made with a sign-up here (not createTestUser), deleted in afterAll. */
const signedUp = new Set<string>();
/** Every user of this file, whose households afterAll deletes. */
const touched = new Set<string>();

async function newUser(name: string): Promise<TestUser> {
  const made = await createTestUser(name);
  touched.add(made.id);
  return made;
}

function freshClient(): Db {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Signs up the way /ga-med does: e-mail, password and the code in the metadata. */
async function signUp(name: string, code?: string) {
  const db = freshClient();
  const email = testEmail(name);
  const result = await db.auth.signUp({ email, password: "hemligt-lösen-123", options: code === undefined ? undefined : { data: { invite_code: code } } });
  if (result.data.user) signedUp.add(result.data.user.id);
  return { db, email, result };
}

async function invite(user: TestUser) {
  const made = await user.db.rpc("create_household_invite");
  expect(made.error).toBeNull();
  return made.data![0]!;
}

async function members(householdId: string) {
  const { data, error } = await adminClient().from("household_member").select("user_id, role, color, display_name").eq("household_id", householdId).order("joined_at");
  if (error) throw error;
  return data;
}

async function clearAttempts(userId: string | null) {
  const query = adminClient().from("household_code_attempt").delete();
  const { error } = await (userId === null ? query.is("user_id", null) : query.eq("user_id", userId));
  if (error) throw error;
}

let owner: TestUser;
let ownerHousehold: string;

beforeAll(async () => {
  owner = await newUser("hh-owner");
  ownerHousehold = await householdOf(owner.id);
});

afterAll(async () => {
  // The households go first, with all their rows (a row one member made may point at another's, on
  // delete restrict, so deleting the accounts one by one could be held up), then the accounts.
  const { data } = await adminClient().from("household_member").select("household_id, user_id");
  const ours = new Set([...signedUp, ...touched]);
  for (const household of new Set((data ?? []).filter((row) => ours.has(row.user_id)).map((row) => row.household_id))) {
    await adminClient().from("household").delete().eq("id", household);
  }
  for (const id of signedUp) await adminClient().auth.admin.deleteUser(id);
  await deleteTestUsers();
});

describe("an invitation", () => {
  it("has a code of 6 unambiguous characters, kept only as its hash, valid 7 days", async () => {
    const made = await invite(owner);
    expect(made.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    const days = (new Date(made.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    const stored = (await adminClient().from("household_invite").select("*").eq("id", made.id).single()).data!;
    expect(stored.code_hash).toBe(sha256(made.code));
    expect(JSON.stringify(stored)).not.toContain(made.code);
    expect((await owner.db.rpc("household_invites")).data?.map((row) => row.id)).toContain(made.id);
  });

  it("is revoked and restored by a member, and never read directly", async () => {
    const made = await invite(owner);
    expect((await owner.db.rpc("revoke_household_invite", { invite_id: made.id })).data).toBe(true);
    expect((await owner.db.rpc("household_invites")).data?.map((row) => row.id)).not.toContain(made.id);
    expect((await owner.db.rpc("restore_household_invite", { invite_id: made.id })).data).toBe(true);
    expect((await owner.db.rpc("household_invites")).data?.map((row) => row.id)).toContain(made.id);
    expect((await owner.db.from("household_invite").select("id")).error?.code).toBe("42501");
    expect((await owner.db.from("household_code_attempt").select("id")).error?.code).toBe("42501");
    expect((await anonClient().from("household_code_attempt").select("id")).error?.code).toBe("42501");
  });

  it("is shown before sign-in with the household, the inviter and the members; an unknown code counts", async () => {
    await clearAttempts(null);
    const made = await invite(owner);
    const preview = (await anonClient().rpc("household_invite_preview", { code: made.code.toLowerCase() })).data as Record<string, unknown>;
    expect(preview).toMatchObject({ status: "ok", invited_by: expect.any(String), already_member: false, own_data: false });
    expect(preview.members).toEqual([{ initial: expect.any(String), color: "mint" }]);
    expect((await owner.db.rpc("household_invite_preview", { code: made.code })).data).toMatchObject({ already_member: true });
    expect((await anonClient().rpc("household_invite_preview", { code: "ZZZZZZ" })).data).toEqual({ status: "unknown" });
    expect((await adminClient().from("household_code_attempt").select("id").is("user_id", null)).data).toHaveLength(1);
    await owner.db.rpc("revoke_household_invite", { invite_id: made.id });
    expect((await anonClient().rpc("household_invite_preview", { code: made.code })).data).toMatchObject({ status: "gone" });
  });

  it("locks the preview for everyone without a session after 50 wrong codes in ten minutes", async () => {
    await clearAttempts(null);
    const made = await invite(owner);
    const rows = Array.from({ length: 50 }, () => ({ user_id: null }));
    expect((await adminClient().from("household_code_attempt").insert(rows)).error).toBeNull();
    expect((await anonClient().rpc("household_invite_preview", { code: made.code })).data).toEqual({ status: "locked" });
    await clearAttempts(null);
  });
});

describe("the sign-up hook", () => {
  it("refuses a sign-up without a code, with a wrong one, and a sign-in link to an unknown address", async () => {
    for (const code of [undefined, "", "ZZZZZZ", "K7Q4MP"]) {
      const { result } = await signUp(`hook-no-${randomUUID().slice(0, 6)}`, code);
      expect(result.error?.status, `code ${code}`).toBe(403);
      expect(result.data.user).toBeNull();
    }
    const otp = await freshClient().auth.signInWithOtp({ email: testEmail("hook-otp") });
    expect(otp.error?.status).toBe(403);
  });

  it("refuses a revoked, an expired and a used code, and lets a valid one through with a session", async () => {
    const revoked = await invite(owner);
    await owner.db.rpc("revoke_household_invite", { invite_id: revoked.id });
    expect((await signUp("hook-revoked", revoked.code)).result.error?.status).toBe(403);

    const expired = await invite(owner);
    await adminClient().from("household_invite").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", expired.id);
    expect((await signUp("hook-expired", expired.code)).result.error?.status).toBe(403);

    const valid = await invite(owner);
    const joiner = await signUp("hook-valid", valid.code);
    expect(joiner.result.error).toBeNull();
    expect(joiner.result.data.session).not.toBeNull();
    expect((await joiner.db.rpc("accept_household_invite", { code: valid.code })).data).toHaveLength(1);
    expect((await signUp("hook-used", valid.code)).result.error?.status).toBe(403);
  });
});

describe("joining", () => {
  it("moves a new account into the household, drops its own empty one and uses the code up", async () => {
    const made = await invite(owner);
    const joiner = await signUp("join-new", made.code);
    const id = joiner.result.data.user!.id;
    const ownHousehold = await householdOf(id);
    const accepted = await joiner.db.rpc("accept_household_invite", { code: ` ${made.code.slice(0, 3).toLowerCase()} ${made.code.slice(3)} ` });
    expect(accepted.data).toEqual([{ household_id: ownerHousehold, household_name: expect.any(String) }]);
    expect(await householdOf(id)).toBe(ownerHousehold);
    expect((await adminClient().from("household").select("id").eq("id", ownHousehold)).data, "the empty household went").toEqual([]);
    const invited = (await adminClient().from("household_invite").select("used_by, used_at").eq("id", made.id).single()).data!;
    expect(invited.used_by).toBe(id);
    const row = (await members(ownerHousehold)).find((member) => member.user_id === id)!;
    expect(row.role).toBe("member");
    expect(row.color).not.toBe("mint");
    // The same code again, by someone else: no row.
    const other = await newUser("join-again");
    expect((await other.db.rpc("accept_household_invite", { code: made.code })).data).toEqual([]);
    // An account that used an invitation can still be deleted; the invitation stays used.
    const usedInvite = await invite(owner);
    const used = await signUp("join-deleted", usedInvite.code);
    expect((await used.db.rpc("accept_household_invite", { code: usedInvite.code })).data).toHaveLength(1);
    expect((await adminClient().auth.admin.deleteUser(used.result.data.user!.id)).error).toBeNull();
    signedUp.delete(used.result.data.user!.id);
    expect((await adminClient().from("household_invite").select("used_by, used_at").eq("id", usedInvite.id).single()).data).toMatchObject({ used_by: null, used_at: expect.any(String) });
    // Both see the same list.
    const item = await owner.db.from("shopping_custom_item").insert({ meal_plan_id: null, label: "Mjölk" }).select("id").single();
    expect((await joiner.db.from("shopping_custom_item").select("label").eq("id", item.data!.id)).data).toEqual([{ label: "Mjölk" }]);
    await joiner.db.rpc("leave_household");
  });

  it("refuses an account alone with data of its own, and someone who is a member already", async () => {
    const made = await invite(owner);
    const busy = await newUser("join-busy");
    expect((await busy.db.from("shopping_custom_item").insert({ meal_plan_id: null, label: "Egen" })).error).toBeNull();
    expect((await busy.db.rpc("household_invite_preview", { code: made.code })).data).toMatchObject({ status: "ok", own_data: true });
    expect((await busy.db.rpc("accept_household_invite", { code: made.code })).error?.code).toBe("MK452");
    expect((await owner.db.rpc("accept_household_invite", { code: made.code })).error?.code).toBe("MK453");
    // Only a place in Förråd counts as data of its own too.
    const placer = await newUser("join-placer");
    const site = await placer.db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true }).select("id").single();
    expect((await placer.db.from("thing_place").insert({ site_id: site.data!.id, room: "Garaget", room_key: "garaget", part: null, part_key: "" })).error).toBeNull();
    expect((await placer.db.rpc("accept_household_invite", { code: made.code })).error?.code).toBe("MK452");
    // The start data alone (one boende) is no data of its own.
    const starter = await newUser("join-starter");
    expect((await starter.db.from("pantry_site").insert({ name: "Hemma", normalized_name: "hemma", is_selected: true })).error).toBeNull();
    expect((await starter.db.rpc("accept_household_invite", { code: made.code })).data).toHaveLength(1);
    await starter.db.rpc("leave_household");
  });

  it("locks an account out of codes after 10 wrong ones in an hour, even a right one", async () => {
    const guesser = await newUser("join-guess");
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await guesser.db.rpc("accept_household_invite", { code: `ZZZZ${attempt}A` })).data).toEqual([]);
    }
    const made = await invite(owner);
    expect((await guesser.db.rpc("accept_household_invite", { code: made.code })).error?.code).toBe("MK451");
    expect((await guesser.db.rpc("household_invite_preview", { code: made.code })).data).toEqual({ status: "locked" });
    expect(await householdOf(guesser.id)).not.toBe(ownerHousehold);
    await clearAttempts(guesser.id);
    expect((await guesser.db.rpc("accept_household_invite", { code: made.code })).data).toHaveLength(1);
    await guesser.db.rpc("leave_household");
  });
});

describe("leaving, removing and the owner", () => {
  it("lets a member leave to an empty household of their own, and leaves what they made behind", async () => {
    const made = await invite(owner);
    const member = await newUser("leave-member");
    await member.db.rpc("accept_household_invite", { code: made.code });
    const item = await member.db.from("shopping_custom_item").insert({ meal_plan_id: null, label: "Bröd" }).select("id").single();
    const left = await member.db.rpc("leave_household");
    expect(left.error).toBeNull();
    expect(left.data).not.toBe(ownerHousehold);
    expect(await householdOf(member.id)).toBe(left.data);
    expect((await members(left.data!)).map((row) => row.role)).toEqual(["owner"]);
    expect((await member.db.from("shopping_custom_item").select("id").eq("id", item.data!.id)).data).toEqual([]);
    expect((await owner.db.from("shopping_custom_item").select("id").eq("id", item.data!.id)).data).toHaveLength(1);
    expect((await member.db.rpc("leave_household")).error?.code, "alone").toBe("MK456");
  });

  it("hands the ownership to the longest member when the owner leaves", async () => {
    const boss = await newUser("own-boss");
    const first = await newUser("own-first");
    const second = await newUser("own-second");
    const household = await householdOf(boss.id);
    for (const user of [first, second]) expect((await user.db.rpc("accept_household_invite", { code: (await invite(boss)).code })).error).toBeNull();
    expect((await boss.db.rpc("leave_household")).error).toBeNull();
    const after = await members(household);
    expect(after.map((row) => [row.user_id, row.role])).toEqual([
      [first.id, "owner"],
      [second.id, "member"],
    ]);
  });

  it("lets only the owner remove a member or hand over, never themselves", async () => {
    const boss = await newUser("rm-boss");
    const member = await newUser("rm-member");
    const household = await householdOf(boss.id);
    await member.db.rpc("accept_household_invite", { code: (await invite(boss)).code });
    expect((await member.db.rpc("remove_household_member", { member: boss.id })).error?.code).toBe("MK454");
    expect((await member.db.rpc("make_household_owner", { member: member.id })).error?.code).toBe("MK454");
    expect((await boss.db.rpc("remove_household_member", { member: boss.id })).error?.code).toBe("MK455");
    expect((await boss.db.rpc("make_household_owner", { member: member.id })).error).toBeNull();
    expect((await members(household)).map((row) => [row.user_id, row.role])).toEqual([
      [boss.id, "member"],
      [member.id, "owner"],
    ]);
    expect((await member.db.rpc("remove_household_member", { member: boss.id })).error).toBeNull();
    expect((await members(household)).map((row) => row.user_id)).toEqual([member.id]);
    expect(await householdOf(boss.id)).not.toBe(household);
    expect((await boss.db.rpc("my_household_id")).data).not.toBe(household);
  });
});

describe("the names", () => {
  it("sets the person's own name once said, and the household's, within their lengths", async () => {
    const user = await newUser("names");
    expect((await user.db.rpc("household_members")).data?.[0]).toMatchObject({ named: false, is_me: true });
    expect((await user.db.rpc("set_my_display_name", { new_name: "  Anna   Lena " })).data).toBe("Anna Lena");
    expect((await user.db.rpc("household_members")).data?.[0]).toMatchObject({ display_name: "Anna Lena", named: true });
    expect((await user.db.rpc("set_my_display_name", { new_name: " " })).error?.code).toBe("22023");
    expect((await user.db.rpc("set_my_display_name", { new_name: "x".repeat(41) })).error?.code).toBe("22023");
    expect((await user.db.rpc("rename_household", { new_name: "Hushållet Hellgren" })).data).toBe("Hushållet Hellgren");
    expect((await user.db.rpc("rename_household", { new_name: "" })).error?.code).toBe("22023");
    // The name and when it was said move along with the person.
    await user.db.rpc("accept_household_invite", { code: (await invite(owner)).code });
    expect((await user.db.rpc("household_members")).data?.find((row) => row.is_me)).toMatchObject({ display_name: "Anna Lena", named: true });
    await user.db.rpc("leave_household");
  });
});

// The 21.2a review's leftover files: a member's file without a row under the household's places
// stays the household's after the member has gone (the household can remove it), and the member
// who left cannot read it.
describe("the files of a member who left", () => {
  it("stay the household's to remove, and are no one else's", async () => {
    const member = await newUser("files-member");
    const outsider = await newUser("files-outsider");
    await member.db.rpc("accept_household_invite", { code: (await invite(owner)).code });
    const created = await owner.db.from("pantry_site").insert({ name: "Filstugan", normalized_name: "filstugan", is_selected: true }).select("id").single();
    expect(created.error).toBeNull();
    const site = created.data!;
    const place = (await owner.db.from("thing_place").insert({ site_id: site.id, room: "Förrådet", room_key: "förrådet", part: null, part_key: "" }).select("id").single());
    expect(place.error).toBeNull();
    const leftover = `${member.id}/${place.data!.id}/${randomUUID()}.png`;
    expect((await member.db.storage.from(thingPhotoBucket).upload(leftover, photoBytes, { contentType: "image/png" })).error).toBeNull();
    await member.db.rpc("leave_household");

    expect((await member.db.storage.from(thingPhotoBucket).download(leftover)).error, "the member who left reads it").not.toBeNull();
    expect((await outsider.db.storage.from(thingPhotoBucket).download(leftover)).error, "another household reads it").not.toBeNull();
    expect((await owner.db.storage.from(thingPhotoBucket).download(leftover)).error, "the household reads it").toBeNull();
    expect((await owner.db.storage.from(thingPhotoBucket).list(`${member.id}/${place.data!.id}`)).data?.length, "the household lists it").toBe(1);
    expect((await owner.db.storage.from(thingPhotoBucket).remove([leftover])).data, "the household removes it").toHaveLength(1);
    expect((await adminClient().storage.from(thingPhotoBucket).download(leftover)).error, "it is gone").not.toBeNull();
    // No one may put a file under the household's place in a former member's folder.
    expect((await member.db.storage.from(thingPhotoBucket).upload(leftover, photoBytes, { contentType: "image/png" })).error).not.toBeNull();
    await adminClient().from("pantry_site").delete().eq("id", site.id);
  });
});

describe("the functions' grants", () => {
  it("give the hook only to Supabase Auth and every function only to authenticated (the preview to anon too)", () => {
    const rows = localSql<{ name: string; anon: boolean; authenticated: boolean; auth_admin: boolean; definer: boolean; path: string }>(`
      select p.proname as name, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE') as auth_admin,
        p.prosecdef as definer, coalesce(array_to_string(p.proconfig, ','), '') as path
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
        'create_household_invite', 'revoke_household_invite', 'restore_household_invite', 'household_invites', 'household_members',
        'household_invite_preview', 'accept_household_invite', 'leave_household', 'remove_household_member', 'make_household_owner',
        'rename_household', 'set_my_display_name', 'household_signup_hook')
      order by 1`);
    expect(rows).toHaveLength(13);
    for (const row of rows) {
      expect(row.definer, row.name).toBe(true);
      expect(row.path, row.name).toBe('search_path=""');
      if (row.name === "household_signup_hook") {
        expect([row.anon, row.authenticated, row.auth_admin]).toEqual([false, false, true]);
      } else {
        expect(row.authenticated, row.name).toBe(true);
        expect(row.anon, row.name).toBe(row.name === "household_invite_preview");
      }
    }
  });
});

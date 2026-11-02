import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { isMemberColor, type Household, type Me, type Member, type MemberColor, type PendingInvite } from "../domain/member";

// The household's functions (Story 21.2b, supabase/migrations/…_household_members.sql).
// Every call goes through a security definer function; no table is written
// directly. Errors carry only a code, never a name, an address or a code.

export type HouseholdDb = SupabaseClient<Database>;

/** A failed call; `detail` is a fixed reason with the database's code, never user data. */
export class HouseholdDataError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "HouseholdDataError";
  }
}

/** The database's own refusals (errcodes in the migration). */
export const householdErrorCodes = {
  inviteLocked: "MK451",
  hasData: "MK452",
  alreadyMember: "MK453",
  notOwner: "MK454",
  memberGone: "MK455",
  alone: "MK456",
  tooManyInvites: "MK457",
  invalidName: "22023",
} as const;

/** A refusal the action turns into a message: the code from householdErrorCodes. */
export class HouseholdRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "HouseholdRefusal";
  }
}

const known = new Set<string>(Object.values(householdErrorCodes));

function failure(what: string, error: { code?: string } | null): never {
  const code = error?.code ?? "unknown";
  if (known.has(code)) throw new HouseholdRefusal(code);
  throw new HouseholdDataError(`${what}_failed ${code}`);
}

const shadeOf = (value: unknown): MemberColor => (isMemberColor(value) ? value : "mint");

/** The caller's own membership, or null without one. */
export async function loadMeIn(db: HouseholdDb): Promise<Me | null> {
  const { data: claims } = await db.auth.getClaims();
  const id = claims?.claims?.sub;
  if (typeof id !== "string") return null;
  const { data, error } = await db.from("household_member").select("display_name, color, named_at").eq("user_id", id).maybeSingle();
  if (error) failure("me", error);
  return data ? { name: data.display_name, color: shadeOf(data.color), named: data.named_at !== null } : null;
}

/** The members of the caller's household, in the order they joined. */
export async function loadMembersIn(db: HouseholdDb): Promise<Member[]> {
  const { data, error } = await db.rpc("household_members");
  if (error) failure("members", error);
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    email: row.email,
    role: row.role === "owner" ? "owner" : "member",
    color: shadeOf(row.color),
    joinedAt: row.joined_at,
    named: row.named,
    isMe: row.is_me,
  }));
}

/** The caller's household: its name, members and open invitations. */
export async function loadHouseholdIn(db: HouseholdDb): Promise<Household> {
  const [household, members, invites] = await Promise.all([
    db.from("household").select("name").maybeSingle(),
    loadMembersIn(db),
    db.rpc("household_invites"),
  ]);
  if (household.error || !household.data) failure("household", household.error);
  if (invites.error) failure("invites", invites.error);
  const pending: PendingInvite[] = (invites.data ?? []).map((row) => ({
    id: row.id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
  return { name: household.data.name, members, invites: pending };
}

export type NewInvite = { id: string; code: string; expiresAt: string };

export async function createInviteIn(db: HouseholdDb): Promise<NewInvite> {
  const { data, error } = await db.rpc("create_household_invite");
  if (error) failure("invite", error);
  const row = data?.[0];
  if (!row) throw new HouseholdDataError("invite_failed empty");
  return { id: row.id, code: row.code, expiresAt: row.expires_at };
}

/** Closes (or with `restore`, opens again) an invitation of the caller's household; false when there was none to change. */
export async function setInviteRevokedIn(db: HouseholdDb, inviteId: string, restore: boolean): Promise<boolean> {
  const { data, error } = restore
    ? await db.rpc("restore_household_invite", { invite_id: inviteId })
    : await db.rpc("revoke_household_invite", { invite_id: inviteId });
  if (error) failure("revoke", error);
  return data === true;
}

const previewSchema = z.object({
  status: z.enum(["ok", "gone", "unknown", "locked"]),
  household: z.string().nullish(),
  invited_by: z.string().nullish(),
  expires_at: z.string().nullish(),
  members: z.array(z.object({ initial: z.string(), color: z.string() })).nullish(),
  already_member: z.boolean().nullish(),
  own_data: z.boolean().nullish(),
});

/** What /ga-med shows of an invitation before anyone joins. */
export type InvitePreview =
  | {
      status: "ok" | "gone";
      household: string;
      invitedBy: string | null;
      expiresAt: string;
      members: { initial: string; color: MemberColor }[];
      alreadyMember: boolean;
      /** Signed in, alone in a household with data of its own: joining is refused (decision 10's fallback). */
      ownData: boolean;
    }
  | { status: "unknown" | "locked" };

export async function previewInviteIn(db: HouseholdDb, code: string): Promise<InvitePreview> {
  const { data, error } = await db.rpc("household_invite_preview", { code });
  if (error) failure("preview", error);
  const parsed = previewSchema.safeParse(data);
  if (!parsed.success) throw new HouseholdDataError("preview_failed invalid");
  const row = parsed.data;
  if (row.status === "unknown" || row.status === "locked") return { status: row.status };
  return {
    status: row.status,
    household: row.household ?? "",
    invitedBy: row.invited_by ?? null,
    expiresAt: row.expires_at ?? "",
    members: (row.members ?? []).map((member) => ({ initial: member.initial, color: shadeOf(member.color) })),
    alreadyMember: row.already_member === true,
    ownData: row.own_data === true,
  };
}

/** Joins the code's household; null when the code is not (or no longer) valid. */
export async function acceptInviteIn(db: HouseholdDb, code: string): Promise<{ householdName: string } | null> {
  const { data, error } = await db.rpc("accept_household_invite", { code });
  if (error) failure("accept", error);
  const row = data?.[0];
  return row ? { householdName: row.household_name } : null;
}

export async function leaveHouseholdIn(db: HouseholdDb): Promise<void> {
  const { error } = await db.rpc("leave_household");
  if (error) failure("leave", error);
}

export async function removeMemberIn(db: HouseholdDb, member: string): Promise<void> {
  const { error } = await db.rpc("remove_household_member", { member });
  if (error) failure("remove", error);
}

export async function makeOwnerIn(db: HouseholdDb, member: string): Promise<void> {
  const { error } = await db.rpc("make_household_owner", { member });
  if (error) failure("owner", error);
}

export async function renameHouseholdIn(db: HouseholdDb, name: string): Promise<string> {
  const { data, error } = await db.rpc("rename_household", { new_name: name });
  if (error) failure("rename", error);
  return data ?? name;
}

export async function setMyNameIn(db: HouseholdDb, name: string): Promise<string> {
  const { data, error } = await db.rpc("set_my_display_name", { new_name: name });
  if (error) failure("name", error);
  return data ?? name;
}

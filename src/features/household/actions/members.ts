"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { keepSessionOnlyWithAccess, requireUser } from "@/features/auth/server";
import { type ErrorCode, fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import {
  createInviteIn,
  HouseholdDataError,
  householdErrorCodes,
  HouseholdRefusal,
  leaveHouseholdIn,
  makeOwnerIn,
  type NewInvite,
  removeMemberIn,
  renameHouseholdIn,
  setInviteRevokedIn,
  setMyNameIn,
} from "../data/household";
import { removeLeftoverFilesIn } from "../data/leftover-files";
import { cleanName, householdNameMaxLength, memberNameMaxLength } from "../domain/member";

// Medlemmar (Story 21.2b): inviting, removing, handing over, leaving and the
// names. Every write is a security definer function that checks the caller
// (the migration); these only check the input and turn refusals into
// messages. Only reasons are logged, never a name, an address or a code.

const refusalMessages: Record<string, ErrorCode> = {
  [householdErrorCodes.notOwner]: "household_not_owner",
  [householdErrorCodes.memberGone]: "household_member_gone",
  [householdErrorCodes.alone]: "household_alone",
  [householdErrorCodes.tooManyInvites]: "household_too_many_invites",
};

async function run<T>(what: string, write: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await write());
  } catch (error) {
    if (error instanceof HouseholdRefusal) {
      const code = refusalMessages[error.code];
      if (code) return fail(code);
      if (error.code === householdErrorCodes.invalidName) return fail("validation");
    }
    if (!(error instanceof HouseholdDataError) && !(error instanceof HouseholdRefusal)) throw error;
    console.error("household_failed", { what, reason: error instanceof HouseholdDataError ? error.detail : error.code });
    return fail("household_failed");
  }
}

const idSchema = z.uuid();

/** "Bjud in någon": a new code for the caller's household, shown once. */
export async function createInvite(): Promise<Result<NewInvite>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const made = await run("invite", async () => createInviteIn(await createClient()));
  if (made.ok) revalidateFor("household");
  return made;
}

/** The trash on an invitation ("Tog bort inbjudan."), and its "Ångra" with `restore`. */
export async function setInviteRevoked(input: { inviteId: string; restore?: boolean }): Promise<Result<boolean>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const id = idSchema.safeParse(input?.inviteId);
  if (!id.success) return fail("validation");
  const changed = await run("revoke", async () => setInviteRevokedIn(await createClient(), id.data, input.restore === true));
  if (changed.ok) revalidateFor("household");
  return changed;
}

/**
 * "Ta bort ur hushållet" (the owner only). The member's files without a row
 * under the household's places go first, while they are still a member.
 */
export async function removeMember(input: { userId: string }): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const id = idSchema.safeParse(input?.userId);
  if (!id.success || id.data === user.data.id) return fail("validation");
  const db = await createClient();
  const removed = await run("remove", async () => {
    await removeLeftoverFilesIn(db, id.data);
    await removeMemberIn(db, id.data);
    return null;
  });
  if (removed.ok) revalidateFor("household_member");
  return removed;
}

/** "Gör till ägare" (the owner only). */
export async function makeOwner(input: { userId: string }): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const id = idSchema.safeParse(input?.userId);
  if (!id.success || id.data === user.data.id) return fail("validation");
  const made = await run("owner", async () => {
    await makeOwnerIn(await createClient(), id.data);
    return null;
  });
  if (made.ok) revalidateFor("household_member");
  return made;
}

/**
 * "Lämna hushållet": the caller gets a household of their own, empty. Their
 * files without a row go first. Someone let in only through the household has
 * no access afterwards: they are signed out and sent to the login page.
 */
export async function leaveHousehold(): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const db = await createClient();
  const left = await run("leave", async () => {
    await removeLeftoverFilesIn(db, user.data.id);
    await leaveHouseholdIn(db);
    return null;
  });
  if (!left.ok) return left;
  revalidateFor("household_member");
  if (!(await keepSessionOnlyWithAccess())) redirect("/logga-in?fel=lamnat");
  redirect("/installningar/medlemmar?lamnat=1");
}

const householdNameSchema = z.string().transform(cleanName).pipe(z.string().min(1).max(householdNameMaxLength));
const memberNameSchema = z.string().transform(cleanName).pipe(z.string().min(1).max(memberNameMaxLength));

/** "Namn" on Medlemmar: any member renames the household. */
export async function renameHousehold(input: { name: string }): Promise<Result<{ name: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const name = householdNameSchema.safeParse(input?.name);
  if (!name.success) return fail("validation", { name: name.error.issues[0]?.code === "too_big" ? `Högst ${householdNameMaxLength} tecken.` : "Skriv ett namn." });
  const saved = await run("rename", async () => ({ name: await renameHouseholdIn(await createClient(), name.data) }));
  if (saved.ok) revalidateFor("household");
  return saved;
}

/** "Vad heter du?" and Konto: the caller's own name. */
export async function setMyName(input: { name: string }): Promise<Result<{ name: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const name = memberNameSchema.safeParse(input?.name);
  if (!name.success) return fail("validation", { name: name.error.issues[0]?.code === "too_big" ? `Högst ${memberNameMaxLength} tecken.` : "Skriv ditt namn." });
  const saved = await run("name", async () => ({ name: await setMyNameIn(await createClient(), name.data) }));
  if (saved.ok) revalidateFor("household_member");
  return saved;
}

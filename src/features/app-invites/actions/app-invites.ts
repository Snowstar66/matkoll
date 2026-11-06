"use server";

import { z } from "zod";
import { isAllowedEmail, normalizeEmail } from "@/features/auth";
import { requireUser } from "@/features/auth/server";
import { type ErrorCode, fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";
import { AppInviteDataError, appInviteErrorCodes, AppInviteRefusal, createAppInviteIn, type NewAppInvite, removeAppInviteIn } from "../data/app-invites";
import { isPlausibleEmail } from "../domain/app-invite";

// "Inbjudningar" under Inställningar (Story 21.1): the app's owner invites an address and
// removes one. Every write is a security definer function that checks is_app_owner()
// (the migration); these only check the input and turn refusals into messages. Only
// reasons are logged, never an address or a code.

const refusalMessages: Record<string, ErrorCode> = {
  [appInviteErrorCodes.notOwner]: "app_invite_not_owner",
  [appInviteErrorCodes.notAnAddress]: "validation",
  [appInviteErrorCodes.alreadyInvited]: "app_invite_already",
  [appInviteErrorCodes.tooMany]: "app_invite_too_many",
};

async function run<T>(what: string, write: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await write());
  } catch (error) {
    if (error instanceof AppInviteRefusal) {
      const code = refusalMessages[error.code];
      if (code) return fail(code, code === "validation" ? { email: "Skriv en giltig e-postadress." } : undefined);
    }
    if (!(error instanceof AppInviteDataError) && !(error instanceof AppInviteRefusal)) throw error;
    console.error("app_invite_failed", { what, reason: error instanceof AppInviteDataError ? error.detail : error.code });
    return fail("app_invite_failed");
  }
}

/** "Bjud in": a code for the address, shown once. Owner only (the database decides). */
export async function inviteByEmail(input: { email: string }): Promise<Result<NewAppInvite>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const raw = typeof input?.email === "string" ? input.email : "";
  if (!isPlausibleEmail(raw)) return fail("validation", { email: "Skriv en giltig e-postadress." });
  const email = normalizeEmail(raw);
  // An address on ALLOWED_EMAILS has its account from users:sync and needs no invitation.
  if (isAllowedEmail(email, env.ALLOWED_EMAILS ?? [])) return fail("app_invite_in_env", { email: "Adressen har redan åtkomst." });
  const made = await run("invite", async () => createAppInviteIn(await createClient(), email));
  if (made.ok) revalidateFor("app_invite");
  return made;
}

const idSchema = z.uuid();

/** The trash on an invited address, after the question. The person loses access at their next request. */
export async function removeInvite(input: { inviteId: string }): Promise<Result<boolean>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const id = idSchema.safeParse(input?.inviteId);
  if (!id.success) return fail("validation");
  const removed = await run("remove", async () => removeAppInviteIn(await createClient(), id.data));
  if (removed.ok) revalidateFor("app_invite");
  return removed;
}

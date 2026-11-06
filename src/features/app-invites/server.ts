import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppInviteRefusal, appInviteErrorCodes, listAppInvitesIn, previewAppInviteIn } from "./data/app-invites";
import type { AppInvite } from "./domain/app-invite";

// Server-only entry of the app invitations (Story 21.1).

export { inviteByEmail, removeInvite } from "./actions/app-invites";
export { AppInviteDataError, type AppInvitePreview } from "./data/app-invites";

/** Every invited address for the owner's page, or null for anyone else (decided by is_app_owner() in the database). Throws AppInviteDataError. */
export async function listAppInvites(): Promise<AppInvite[] | null> {
  try {
    return await listAppInvitesIn(await createClient());
  } catch (error) {
    if (error instanceof AppInviteRefusal && error.code === appInviteErrorCodes.notOwner) return null;
    throw error;
  }
}

/** What the join page shows of `code`. Throws AppInviteDataError. */
export async function previewAppInvite(code: string) {
  return previewAppInviteIn(await createClient(), code);
}

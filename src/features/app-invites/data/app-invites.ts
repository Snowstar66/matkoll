import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import type { AppInvite } from "../domain/app-invite";

// The app invitations' functions (Story 21.1, supabase/migrations/…_app_invites.sql). The
// table is closed to every client; the owner works through security definer functions that
// check is_app_owner(). Errors carry only a code, never an address or a code.

export type AppInviteDb = SupabaseClient<Database>;

/** A failed call; `detail` is a fixed reason with the database's code, never user data. */
export class AppInviteDataError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "AppInviteDataError";
  }
}

/** The database's own refusals (errcodes in the migration). */
export const appInviteErrorCodes = { notOwner: "42501", notAnAddress: "22023", alreadyInvited: "MK461", tooMany: "MK462", atOnce: "MK463", locked: "MK451" } as const;

/** A refusal the action turns into a message: the code from appInviteErrorCodes. */
export class AppInviteRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AppInviteRefusal";
  }
}

const known = new Set<string>(Object.values(appInviteErrorCodes));

function failure(what: string, error: { code?: string } | null): never {
  const code = error?.code ?? "unknown";
  if (known.has(code)) throw new AppInviteRefusal(code);
  throw new AppInviteDataError(`${what}_failed ${code}`);
}

export type NewAppInvite = { id: string; code: string; expiresAt: string };

/** A new code for `email` (the owner only); the code is given back this once. */
export async function createAppInviteIn(db: AppInviteDb, email: string): Promise<NewAppInvite> {
  const { data, error } = await db.rpc("create_app_invite", { invite_email: email });
  if (error) failure("create_app_invite", error);
  const row = data?.[0];
  if (!row) throw new AppInviteDataError("create_app_invite_failed empty");
  return { id: row.id, code: row.code, expiresAt: row.expires_at };
}

/** Every invited address, newest first (the owner only). */
export async function listAppInvitesIn(db: AppInviteDb): Promise<AppInvite[]> {
  const { data, error } = await db.rpc("app_invites");
  if (error) failure("list_app_invites", error);
  return (data ?? []).map((row) => ({ id: row.id, email: row.email, createdAt: row.created_at, expiresAt: row.expires_at, accepted: row.accepted }));
}

/** Removes an invitation (the owner only); false when there was none. */
export async function removeAppInviteIn(db: AppInviteDb, inviteId: string): Promise<boolean> {
  const { data, error } = await db.rpc("remove_app_invite", { invite_id: inviteId });
  if (error) failure("remove_app_invite", error);
  return data === true;
}

const previewSchema = z.object({ status: z.enum(["ok", "gone", "unknown", "locked"]), expires_at: z.string().nullish() });

/** What /inbjudan shows of a code before anyone signs up. */
export type AppInvitePreview = { status: "ok" | "gone"; expiresAt: string } | { status: "unknown" | "locked" };

export async function previewAppInviteIn(db: AppInviteDb, code: string): Promise<AppInvitePreview> {
  const { data, error } = await db.rpc("app_invite_preview", { code });
  if (error) throw new AppInviteDataError(`app_invite_preview_failed ${error.code ?? "unknown"}`);
  const parsed = previewSchema.safeParse(data);
  if (!parsed.success) throw new AppInviteDataError("app_invite_preview_failed shape");
  const { status, expires_at } = parsed.data;
  if ((status === "ok" || status === "gone") && expires_at) return { status, expiresAt: expires_at };
  return { status: status === "locked" ? "locked" : "unknown" };
}

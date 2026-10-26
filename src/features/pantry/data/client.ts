import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the pantry module's data functions; in requests, the user's session client. */
export type PantryDb = SupabaseClient<Database>;

/** A failed pantry query. The message holds only a fixed reason and the Postgres code, never user data. */
export class PantryDataError extends Error {
  constructor(readonly detail: string) {
    super(`pantry_data: ${detail}`);
    this.name = "PantryDataError";
  }
}

/** The Postgres code of a place that is removed, or not the user's (pantry_target_site, Story 8.1). */
export const siteGoneCode = "MK410";

/**
 * PantryDataError's detail for a place that is removed, or not the user's:
 * siteGoneCode from a write, or a read of a place that is not one of the
 * user's (pantry/server.ts). The caller gives `pantry_site_gone`, and nothing
 * was written. The only detail for it (Epic 8), so every caller tells it the
 * same way (isSiteGone).
 */
export const siteGoneDetail = "site_gone";

/**
 * The PantryDataError for a Postgres error from a write: siteGoneDetail for
 * siteGoneCode, otherwise `<reason> <code>`.
 */
export function pantryWriteError(reason: string, code: string): PantryDataError {
  return new PantryDataError(code === siteGoneCode ? siteGoneDetail : `${reason} ${code}`);
}

/** Whether `error` says a place is removed, or not the user's (siteGoneDetail). */
export function isSiteGone(error: unknown): boolean {
  return error instanceof PantryDataError && error.detail === siteGoneDetail;
}

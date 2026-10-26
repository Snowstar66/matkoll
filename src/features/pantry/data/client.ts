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

/** PantryDataError's detail for siteGoneCode: the caller gives `pantry_site_gone`, and nothing was written. */
export const siteGoneDetail = "site_gone";

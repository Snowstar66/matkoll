import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the things module's data functions; in requests, the user's session client. */
export type ThingsDb = SupabaseClient<Database>;

/** A failed things query. The message holds only a fixed reason and the Postgres code, never a name, a path or a photo. */
export class ThingsDataError extends Error {
  constructor(readonly detail: string) {
    super(`things_data: ${detail}`);
    this.name = "ThingsDataError";
  }
}

/** The Postgres code of a card that is gone, not the user's, or no longer being read (save_thing_reading). */
export const cardGoneCode = "MK440";

/**
 * Runs a call to Supabase. Anything it throws (a lost connection, a bug in
 * the client) becomes a ThingsDataError `<operation>_threw` without its
 * message, which may hold a path; a ThingsDataError is passed on.
 */
export async function guarded<T>(operation: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof ThingsDataError) throw error;
    throw new ThingsDataError(`${operation}_threw`);
  }
}

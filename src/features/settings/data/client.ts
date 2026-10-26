import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the settings module's data functions; in requests, the user's session client. */
export type SettingsDb = SupabaseClient<Database>;

/** A failed settings query. The message holds only a fixed reason and the Postgres code, never user data. */
export class SettingsDataError extends Error {
  constructor(readonly detail: string) {
    super(`settings_data: ${detail}`);
    this.name = "SettingsDataError";
  }
}

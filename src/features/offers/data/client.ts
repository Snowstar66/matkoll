import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the offers module's data functions; in requests, the user's session client. */
export type OffersDb = SupabaseClient<Database>;

/** A failed offers query. The message holds only a fixed reason and the Postgres code, never user data. */
export class OffersDataError extends Error {
  constructor(readonly detail: string) {
    super(`offers_data: ${detail}`);
    this.name = "OffersDataError";
  }
}

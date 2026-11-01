import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the feedback module's data functions; in requests, the user's session client. */
export type FeedbackDb = SupabaseClient<Database>;

/** A failed feedback query. The message holds only a fixed reason and the Postgres code, never user data. */
export class FeedbackDataError extends Error {
  constructor(readonly detail: string) {
    super(`feedback_data: ${detail}`);
    this.name = "FeedbackDataError";
  }
}

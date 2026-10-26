import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the shopping module's data functions; in requests, the user's session client. */
export type ShoppingDb = SupabaseClient<Database>;

/** A failed shopping query. The message holds only a fixed reason and the Postgres code, never user data. */
export class ShoppingDataError extends Error {
  /**
   * @param detail a fixed reason and the Postgres code: "check_failed 23503"
   * @param code the Postgres error code alone, when the caller needs to tell failures apart
   */
  constructor(
    readonly detail: string,
    readonly code?: string,
  ) {
    super(`shopping_data: ${detail}`);
    this.name = "ShoppingDataError";
  }
}

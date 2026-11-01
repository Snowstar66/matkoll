import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// The user's row in welcome_tour (Story 20.1). RLS limits every call to it.

export type WelcomeDb = SupabaseClient<Database>;

/** A read or write of welcome_tour that failed; `detail` is the code only, for the log. */
export class WelcomeTourDataError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "WelcomeTourDataError";
  }
}

/** Whether the signed-in user has closed the tour once. Throws WelcomeTourDataError. */
export async function loadTourSeenIn(db: WelcomeDb): Promise<boolean> {
  const { data, error } = await db.from("welcome_tour").select("id").limit(1);
  if (error) throw new WelcomeTourDataError(`load_welcome_tour_failed ${error.code}`);
  return data.length > 0;
}

/** Records that the tour has been seen; a second time keeps the first time. Throws WelcomeTourDataError. */
export async function saveTourSeenIn(db: WelcomeDb): Promise<void> {
  const { error } = await db
    .from("welcome_tour")
    .upsert({ tour_seen_at: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw new WelcomeTourDataError(`save_welcome_tour_failed ${error.code}`);
}

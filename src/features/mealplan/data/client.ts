import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the meal plan module's data functions; in requests, the user's session client. */
export type MealPlanDb = SupabaseClient<Database>;

/** A failed meal plan query. The message holds only a fixed reason and the Postgres code, never user data. */
export class MealPlanDataError extends Error {
  /**
   * @param detail a fixed reason and the Postgres code: "set_current_failed P0002"
   * @param code the Postgres error code alone, when the caller needs to tell failures apart
   */
  constructor(
    readonly detail: string,
    readonly code?: string,
  ) {
    super(`mealplan_data: ${detail}`);
    this.name = "MealPlanDataError";
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the meal plan module's data functions; in requests, the user's session client. */
export type MealPlanDb = SupabaseClient<Database>;

/** A failed meal plan query. The message holds only a fixed reason and the Postgres code, never user data. */
export class MealPlanDataError extends Error {
  constructor(readonly detail: string) {
    super(`mealplan_data: ${detail}`);
    this.name = "MealPlanDataError";
  }
}

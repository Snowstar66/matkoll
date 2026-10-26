import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A Supabase client for the recipe module's data functions; in requests, the user's session client. */
export type RecipesDb = SupabaseClient<Database>;

/** A failed recipe query. The message holds only a fixed reason and the Postgres code, never user data. */
export class RecipeDataError extends Error {
  constructor(readonly detail: string) {
    super(`recipe_data: ${detail}`);
    this.name = "RecipeDataError";
  }
}

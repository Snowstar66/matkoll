import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";

/**
 * The signed-in user's active recipe sites, as stored (bare domain names,
 * AD-11). RLS limits the rows to the user's own. Throws SettingsDataError
 * when the query fails.
 */
export async function loadActiveRecipeDomains(db: SettingsDb): Promise<string[]> {
  const { data, error } = await db.from("recipe_site").select("domain").eq("is_active", true).order("domain");
  if (error) throw new SettingsDataError(`query_failed ${error.code}`);
  return data.map((row) => row.domain);
}

import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";

/**
 * Adds the start data for the signed-in user through the Postgres function
 * ensure_user_defaults() (AD-21): the start recipe sites koket.se, tasteline.com,
 * ica.se and arla.se.
 * Idempotent. Throws SettingsDataError when the call fails.
 */
export async function insertUserDefaults(db: SettingsDb): Promise<void> {
  const { error } = await db.rpc("ensure_user_defaults");
  if (error) throw new SettingsDataError(`ensure_user_defaults ${error.code}`);
}

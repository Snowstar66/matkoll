import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";
import { aiLevels, type AiLevel, type AiSetting } from "../domain/ai-choice";

// The household's one row in ai_setting (Story 17.5; Story 21.2a: the AI choice is
// the household's, keyed on household_id). RLS limits every read to it. Only the
// app's owner writes it, through set_ai_setting and clear_ai_setting (security
// review S-07): no client may insert, update or delete the row directly.

function isLevel(value: string): value is AiLevel {
  return (aiLevels as readonly string[]).includes(value);
}

/** The household's saved AI choice, or `null` when there is none. Throws SettingsDataError. */
export async function loadAiSettingIn(db: SettingsDb): Promise<AiSetting | null> {
  const { data, error } = await db.from("ai_setting").select("provider, model, effort").maybeSingle();
  if (error) throw new SettingsDataError(`load_ai_setting_failed ${error.code}`);
  if (!data) return null;
  if ((data.provider !== "lmstudio" && data.provider !== "anthropic") || !isLevel(data.effort)) return null;
  return { provider: data.provider, model: data.model, effort: data.effort };
}

/**
 * Saves the choice, replacing the household's row (whoever made it; its maker
 * stays). The database lets only the app's owner do it (42501 for anyone else).
 * Throws SettingsDataError.
 */
export async function saveAiSettingIn(db: SettingsDb, setting: AiSetting): Promise<void> {
  const { error } = await db.rpc("set_ai_setting", {
    new_provider: setting.provider,
    new_model: setting.model,
    new_effort: setting.effort,
  });
  if (error) throw new SettingsDataError(`save_ai_setting_failed ${error.code}`);
}

/**
 * Removes the household's choice, so the environment's default applies again. Only
 * the app's owner may (42501 for anyone else). Throws SettingsDataError.
 */
export async function clearAiSettingIn(db: SettingsDb): Promise<void> {
  const { error } = await db.rpc("clear_ai_setting");
  if (error) throw new SettingsDataError(`clear_ai_setting_failed ${error.code}`);
}

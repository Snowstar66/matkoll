import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";
import { aiLevels, type AiLevel, type AiSetting } from "../domain/ai-choice";

// The household's one row in ai_setting (Story 17.5; Story 21.2a: the AI choice is
// the household's, keyed on household_id). RLS limits every call to it.

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
 * Saves the choice, replacing the household's row (whoever made it). The row's
 * maker (user_id) is the session's on insert and never changes after
 * (household_row_guard), so it is not sent. Throws SettingsDataError.
 */
export async function saveAiSettingIn(db: SettingsDb, setting: AiSetting): Promise<void> {
  const { error } = await db
    .from("ai_setting")
    .upsert({ ...setting, updated_at: new Date().toISOString() }, { onConflict: "household_id" });
  if (error) throw new SettingsDataError(`save_ai_setting_failed ${error.code}`);
}

/** Removes the household's choice, so the environment's default applies again. Throws SettingsDataError. */
export async function clearAiSettingIn(db: SettingsDb): Promise<void> {
  // A delete needs a filter; RLS limits it to the household's one row.
  const { error } = await db.from("ai_setting").delete().not("id", "is", null);
  if (error) throw new SettingsDataError(`clear_ai_setting_failed ${error.code}`);
}

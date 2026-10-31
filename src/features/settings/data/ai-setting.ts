import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";
import { aiLevels, type AiLevel, type AiSetting } from "../domain/ai-choice";

// The user's one row in ai_setting (Story 17.5). RLS limits every call to it.

function isLevel(value: string): value is AiLevel {
  return (aiLevels as readonly string[]).includes(value);
}

/** The user's saved AI choice, or `null` when there is none. Throws SettingsDataError. */
export async function loadAiSettingIn(db: SettingsDb, userId: string): Promise<AiSetting | null> {
  const { data, error } = await db
    .from("ai_setting")
    .select("provider, model, effort")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new SettingsDataError(`load_ai_setting_failed ${error.code}`);
  if (!data) return null;
  if ((data.provider !== "lmstudio" && data.provider !== "anthropic") || !isLevel(data.effort)) return null;
  return { provider: data.provider, model: data.model, effort: data.effort };
}

/** Saves the choice, replacing the user's row. Throws SettingsDataError. */
export async function saveAiSettingIn(db: SettingsDb, userId: string, setting: AiSetting): Promise<void> {
  const { error } = await db
    .from("ai_setting")
    .upsert({ user_id: userId, ...setting, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new SettingsDataError(`save_ai_setting_failed ${error.code}`);
}

/** Removes the user's choice, so the environment's default applies again. Throws SettingsDataError. */
export async function clearAiSettingIn(db: SettingsDb, userId: string): Promise<void> {
  const { error } = await db.from("ai_setting").delete().eq("user_id", userId);
  if (error) throw new SettingsDataError(`clear_ai_setting_failed ${error.code}`);
}

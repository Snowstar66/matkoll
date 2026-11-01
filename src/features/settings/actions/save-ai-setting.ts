"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";
import { SettingsDataError } from "../data/client";
import { clearAiSettingIn, saveAiSettingIn } from "../data/ai-setting";
import { aiSettingSchema, aiSettingsVisible, type AiSettingInput } from "../domain/ai-choice";
import { qwenModelFor } from "../data/ai-env";

/**
 * Saves the choice of AI made in Inställningar (Story 17.5): `default` removes
 * it, so AI_PROVIDER and AI_MODEL decide again. The next AI job uses it
 * without a restart. Fails with `unauthorized`, `validation` (also for a
 * Claude choice without ANTHROPIC_API_KEY, a Qwen choice without
 * LMSTUDIO_BASE_URL, and for anyone the section is not shown to) or
 * `settings_save_failed`.
 */
export async function saveAiSetting(input: AiSettingInput): Promise<Result<AiSettingInput>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!aiSettingsVisible({ nodeEnv: env.NODE_ENV, email: user.data.email, allowed: env.AI_SETTINGS_EMAILS })) {
    return fail("validation");
  }
  const parsed = aiSettingSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const choice = parsed.data;
  if (choice.provider === "anthropic" && !env.ANTHROPIC_API_KEY) return fail("validation");
  if (choice.provider === "lmstudio" && !env.LMSTUDIO_BASE_URL) return fail("validation");

  try {
    const db = await createClient();
    if (choice.provider === "default") await clearAiSettingIn(db);
    else if (choice.provider === "lmstudio") {
      await saveAiSettingIn(db, user.data.id, { provider: "lmstudio", model: qwenModelFor(env), effort: "medium" });
    } else {
      await saveAiSettingIn(db, user.data.id, { provider: "anthropic", model: choice.model, effort: choice.effort });
    }
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_save_failed", { reason: error.detail });
    return fail("settings_save_failed");
  }
  revalidateFor("ai_setting");
  return ok(choice);
}

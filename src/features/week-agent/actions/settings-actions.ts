"use server";

import { createClient } from "@/lib/supabase/server";
import { saveSettingsIn } from "../data/week-agent";
import { parseWeekAgentSettings, weekAgentSettingsSchema, type WeekAgentSettings } from "../domain/settings";
import type { OkOrError } from "./contract";
import { guarded, messages, signedIn } from "./support";

/** Saves the household's settings for the week agent (one row per household, for every phone). Day roles are resolved (skip beats leftover beats vegetarian). The Tillval switch is per device and not part of this. */
export async function saveWeekAgentSettings(settings: WeekAgentSettings): Promise<OkOrError> {
  const user = await signedIn();
  if (!user.ok) return { status: "error", message: user.message };
  const parsed = weekAgentSettingsSchema.safeParse(settings);
  if (!parsed.success) return { status: "error", message: messages.invalid };
  return guarded(async (): Promise<OkOrError> => {
    await saveSettingsIn(await createClient(), parseWeekAgentSettings(parsed.data));
    return { status: "ok" };
  });
}

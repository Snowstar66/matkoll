import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { readDraftIn, readSettingsIn, WeekAgentDataError, type StoredProposal } from "./data/week-agent";
import { defaultWeekAgentSettings, type WeekAgentSettings } from "./domain/settings";

// Server-only entry (AD-1): the household's week agent settings and drafts, saved in the database for every phone.

export { finishDraftIn, readDraftByIdIn, saveDraftIn, saveSettingsIn, updateDraftIn, WeekAgentDataError, type StoredProposal } from "./data/week-agent";

/** The household's settings, or the defaults when they cannot be read (logged by reason only). Memoised per request. */
export const getWeekAgentSettings = cache(async (): Promise<WeekAgentSettings> => {
  try {
    return await readSettingsIn(await createClient());
  } catch (error) {
    if (!(error instanceof WeekAgentDataError)) throw error;
    console.error("week_agent_settings_unavailable", { reason: error.detail });
    return { ...defaultWeekAgentSettings, vegetarianDays: [], skipDays: [], leftoverDays: [], offerStoreIds: [] };
  }
});

/** The week's draft, or null when there is none or it cannot be read (logged by reason only). */
export async function getWeekDraft(weekStart: string): Promise<StoredProposal | null> {
  try {
    return await readDraftIn(await createClient(), weekStart);
  } catch (error) {
    if (!(error instanceof WeekAgentDataError)) throw error;
    console.error("week_agent_draft_unavailable", { reason: error.detail });
    return null;
  }
}

export { getWeekAgentContext } from "./read-context";
// The Server Actions of Veckoagenten (AD-1): a page passes them down to the UI, which cannot import this module's server code.
export { proposeWeek } from "./actions/propose-week";
export { alternativesForDay, setDayLock, swapDay } from "./actions/day-actions";
export { applyWeek, discardDraft } from "./actions/apply-week";
export { saveWeekAgentSettings } from "./actions/settings-actions";
export { planWithAi, toPortInput, type AiPlanOutcome, type PlanMode, type PlanModel } from "./ai-plan";

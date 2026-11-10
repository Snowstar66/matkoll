"use server";

import { getAiServiceForUser } from "@/features/settings/server";
import { createClient } from "@/lib/supabase/server";
import { readDraftIn, saveDraftIn } from "../data/week-agent";
import { planWithAi } from "../ai-plan";
import { openDays, planAroundFixed } from "../domain/plan";
import { isPlannableWeek } from "../context";
import { proposeWeekInputSchema, type ProposeWeekInput, type ProposeWeekResult } from "./contract";
import { buildPlanInput } from "./plan-input";
import { guarded, messages, settingsOfHousehold, signedIn } from "./support";

/** The time the model gets (a retry on Sonnet included); Matsedel's page allows 300 s. */
const planDeadlineMs = 120_000;

/**
 * "Föreslå veckan", "Gör om", "Gör noggrannare": plans the open days of a week around the days that stay (every dish
 * in Matsedel for the week, plus the days locked in the draft) and saves the result as the week's draft. Nothing is
 * written to Matsedel. `plan` and `reroll` ask Haiku 5.5 at low effort and only go to Sonnet 5.5 when the answer
 * breaks a hard rule; `careful` asks Sonnet 5.5 at medium. Any failure of the model ends in the rule-based plan
 * (`model: "rules"`). Never throws for an expected case.
 */
export async function proposeWeek(input: ProposeWeekInput): Promise<ProposeWeekResult> {
  const user = await signedIn();
  if (!user.ok) return { status: "error", message: user.message };
  const parsed = proposeWeekInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: messages.invalid };
  const { weekStart, mode, lockedDays = [], replaceAgentDays = false } = parsed.data;
  if (!isPlannableWeek(weekStart)) return { status: "error", message: messages.badWeek };

  return guarded(async (): Promise<ProposeWeekResult> => {
    const db = await createClient();
    const [settings, draft] = await Promise.all([settingsOfHousehold(), readDraftIn(db, weekStart)]);
    const { input: planInput, shortlist } = await buildPlanInput(weekStart, settings, draft, lockedDays, mode !== "plan", replaceAgentDays);
    if (openDays(planInput).length === 0) return { status: "error", message: messages.weekFull };

    // Too few dishes after the hard rules: say so before any paid call.
    const check = planAroundFixed(planInput, [], shortlist.excludedForAllergy);
    if (check.status === "too_few_recipes") return check;

    const ai = await getAiServiceForUser();
    const outcome = await planWithAi(ai, planInput, shortlist.excludedForAllergy, mode, new AbortController().signal, Date.now() + planDeadlineMs);
    if (outcome.status === "cap_reached") return { status: "cap_reached" };
    if (outcome.status === "too_few_recipes") return outcome;

    const draftId = await saveDraftIn(db, weekStart, outcome.result.proposal, outcome.model);
    return { status: "ok", draftId, proposal: outcome.result.proposal, excludedForAllergy: outcome.result.excludedForAllergy, model: outcome.model };
  });
}

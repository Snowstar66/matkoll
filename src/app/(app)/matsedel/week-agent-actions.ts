"use server";

import { requireUser } from "@/features/auth/server";
import { listStores } from "@/features/settings/server";
import { getAgentPlacedDays, getWeekAgentSettings } from "@/features/week-agent/server";
import { weekStartSchema } from "@/features/mealplan";
import type {
  AlternativesInput,
  AlternativesResult,
  ApplyWeekInput,
  ApplyWeekResult,
  DiscardDraftInput,
  DraftResult,
  OkOrError,
  ProposeWeekInput,
  ProposeWeekResult,
  SetDayLockInput,
  SwapDayInput,
} from "@/features/week-agent/ui";
import type { WeekAgentSettings } from "@/features/week-agent";
import type { SettingsContext } from "@/features/week-agent/ui";

// The Server Actions Matsedel's Veckoagent screens call, at the route layer (AD-1: the screens never import
// another module; this file puts them together). The seven actions of the contract (src/features/week-agent/actions/
// contract.ts) belong to the backend (PR 2). Until it lands each answers "error" with a plain message, so the screens
// show their error state instead of failing; swap each body for a call of the real action when PR 2 is merged.

const notReady = { status: "error" as const, message: "Veckoagenten är inte klar än. Försök igen när den har uppdaterats." };

export async function proposeWeek(input: ProposeWeekInput): Promise<ProposeWeekResult> {
  void input;
  return notReady;
}
export async function alternativesForDay(input: AlternativesInput): Promise<AlternativesResult> {
  void input;
  return notReady;
}
export async function swapDay(input: SwapDayInput): Promise<DraftResult> {
  void input;
  return notReady;
}
export async function setDayLock(input: SetDayLockInput): Promise<DraftResult> {
  void input;
  return notReady;
}
export async function applyWeek(input: ApplyWeekInput): Promise<ApplyWeekResult> {
  void input;
  return notReady;
}
export async function discardDraft(input: DiscardDraftInput): Promise<OkOrError> {
  void input;
  return notReady;
}
export async function saveWeekAgentSettings(settings: WeekAgentSettings): Promise<OkOrError> {
  void settings;
  return notReady;
}

/** The household's settings and followed stores for the sheet Ställ in; `null` when they cannot be read. */
export async function loadWeekAgentSettings(): Promise<SettingsContext | null> {
  const user = await requireUser();
  if (!user.ok) return null;
  try {
    const [settings, stores] = await Promise.all([getWeekAgentSettings(), listStores()]);
    return { settings, stores: stores.map((store) => ({ id: store.id, name: store.name })) };
  } catch (error) {
    console.error("week_agent_settings_context_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

/** The weekdays of the week whose dish an earlier "Använd veckan" put there; `null` when they cannot be read. */
export async function loadAgentDays(weekStart: string): Promise<number[] | null> {
  const user = await requireUser();
  if (!user.ok) return null;
  if (!weekStartSchema.safeParse(weekStart).success) return null;
  return getAgentPlacedDays(weekStart);
}

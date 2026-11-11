"use server";

import { requireUser } from "@/features/auth/server";
import { listStores } from "@/features/settings/server";
import {
  alternativesForDay as realAlternatives,
  applyWeek as realApply,
  discardDraft as realDiscard,
  getAgentPlacedDays,
  getWeekAgentSettings,
  proposeWeek as realPropose,
  saveWeekAgentSettings as realSave,
  setDayLock as realLock,
  swapDay as realSwap,
  undoWeek as realUndo,
} from "@/features/week-agent/server";
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
  UndoWeekInput,
  UndoWeekResult,
} from "@/features/week-agent/ui";
import type { WeekAgentSettings } from "@/features/week-agent";
import type { SettingsContext } from "@/features/week-agent/ui";

// The Server Actions Matsedel's Veckoagent screens call, at the route layer (AD-1: the screens never import
// another module; this file puts them together). Each wraps the backend's action (src/features/week-agent/actions).

export async function proposeWeek(input: ProposeWeekInput): Promise<ProposeWeekResult> {
  return realPropose(input);
}
export async function alternativesForDay(input: AlternativesInput): Promise<AlternativesResult> {
  return realAlternatives(input);
}
export async function swapDay(input: SwapDayInput): Promise<DraftResult> {
  return realSwap(input);
}
export async function setDayLock(input: SetDayLockInput): Promise<DraftResult> {
  return realLock(input);
}
export async function applyWeek(input: ApplyWeekInput): Promise<ApplyWeekResult> {
  return realApply(input);
}
export async function undoWeek(input: UndoWeekInput): Promise<UndoWeekResult> {
  return realUndo(input);
}
export async function discardDraft(input: DiscardDraftInput): Promise<OkOrError> {
  return realDiscard(input);
}
export async function saveWeekAgentSettings(settings: WeekAgentSettings): Promise<OkOrError> {
  return realSave(settings);
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

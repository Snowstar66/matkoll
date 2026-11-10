"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ProposalScreen, type ProposalDraft, type SettingsActions, type WeekAgentActions, WeekAgentCard, WeekAgentMenu } from "@/features/week-agent/ui";
import {
  alternativesForDay,
  applyWeek,
  discardDraft,
  loadAgentDays,
  loadWeekAgentSettings,
  proposeWeek,
  saveWeekAgentSettings,
  setDayLock,
  swapDay,
} from "./week-agent-actions";
import { weekAgentCost } from "./week-agent-cost";

// The route layer's wiring of Veckoagenten into Matsedel (AD-1): the real Server Actions and the cost texts go into
// the screens, which know nothing of them. Client components, since the Tillval is per device.

const cost = weekAgentCost();

const settingsActions: SettingsActions = { load: loadWeekAgentSettings, save: saveWeekAgentSettings };

// No undo action exists yet (the backend adds undoWeek({ draftId })); "Använd veckan" has no Ångra until it is passed here.
const actions: WeekAgentActions = {
  propose: proposeWeek,
  alternatives: alternativesForDay,
  swap: swapDay,
  setLock: setDayLock,
  apply: applyWeek,
  discard: discardDraft,
};

/** The card at the top of Matsedel; nothing unless the Tillval is on and the week has days to fill. */
export function MatsedelWeekAgentCard({ href, weekNumber, filledDays, emptyDays }: { href: string; weekNumber: number; filledDays: number[]; emptyDays: number[] }) {
  return <WeekAgentCard href={href} weekNumber={weekNumber} filledDays={filledDays} emptyDays={emptyDays} settings={{ actions: settingsActions, cost }} />;
}

/** The ⋯ in Matsedel's header for a full week. */
export function MatsedelWeekAgentMenu({ weekStart, redoHref, filledDays, emptyDays }: { weekStart: string; redoHref: string; filledDays: number[]; emptyDays: number[] }) {
  const load = useCallback(() => loadAgentDays(weekStart), [weekStart]);
  return <WeekAgentMenu redoHref={redoHref} filledDays={filledDays} emptyDays={emptyDays} loadAgentDays={load} settings={{ actions: settingsActions, cost }} />;
}

/** The proposal screen (veckoforslag/page.tsx). */
export function MatsedelProposal({
  weekStart,
  weekNumber,
  backHref,
  address,
  initialDraft,
  autoStart,
  ownDays,
  settings,
}: {
  weekStart: string;
  weekNumber: number;
  backHref: string;
  /** The page's own address without ?starta and ?gor-om, so a reload or a step back shows the draft instead of running again. */
  address: string;
  initialDraft: ProposalDraft | null;
  autoStart: boolean;
  /** Set for "Gör om" on a full week: the weekdays that are the household's own. */
  ownDays: number[] | null;
  settings: import("@/features/week-agent/ui").SettingsContext | null;
}) {
  const router = useRouter();
  const onStarted = useCallback(() => {
    router.replace(address, { scroll: false });
  }, [router, address]);
  return (
    <ProposalScreen
      weekStart={weekStart}
      weekNumber={weekNumber}
      backHref={backHref}
      recipesHref="/recept"
      initialDraft={initialDraft}
      autoStart={autoStart}
      redo={ownDays ? { ownDays } : null}
      actions={actions}
      settings={{ actions: settingsActions, cost, preloaded: settings }}
      onStarted={onStarted}
    />
  );
}

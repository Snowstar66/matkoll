"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRightIcon, SparkleIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";
import type { CostTexts, SettingsActions } from "./actions";
import { cardState, cardTexts } from "./format";
import { SettingsSheet } from "./settings-sheet";

// The card at the top of Matsedel (VK-A, VK-N1): "Föreslå veckan" on an empty week, "Fyll resten av veckan" with the
// number of free days on a partly filled one, nothing on a full week (its way in is the ⋯ menu). One tap opens the
// proposal screen; nothing runs by itself. Only with the Tillval Veckoagenten on (per device, so the page, which does
// not know it, always renders this and the card hides itself).

export type WeekAgentCardProps = {
  /** The proposal screen for the week shown. */
  href: string;
  weekNumber: number;
  /** The weekdays (1-7) that have a dish. */
  filledDays: readonly number[];
  /** The weekdays that are free and still ahead. */
  emptyDays: readonly number[];
  settings: { actions: SettingsActions; cost: CostTexts };
};

export function WeekAgentCard({ href, weekNumber, filledDays, emptyDays, settings }: WeekAgentCardProps) {
  const on = useOption("weekAgent");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const state = cardState(filledDays, emptyDays);
  if (!on || state === "none" || state === "full") return null;
  const partial = state === "partial";
  return (
    <div data-testid="week-agent-card" data-state={state} className="flex flex-col rounded-lg bg-mint text-mint-ink">
      <Link href={href} data-testid="week-agent-card-link" className="flex items-start gap-3 rounded-lg p-3.5 pb-1">
        <SparkleIcon size={26} className="mt-0.5 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-headline">{partial ? cardTexts.partialTitle : cardTexts.emptyTitle}</span>
          <span className="text-control font-normal wrap-break-word opacity-90">{partial ? cardTexts.partialBody(emptyDays.length, filledDays) : cardTexts.emptyBody(weekNumber)}</span>
        </span>
        <ChevronRightIcon size={20} className="shrink-0 self-center" />
      </Link>
      <button type="button" onClick={() => setSettingsOpen(true)} className="min-h-tap self-start rounded-lg px-3.5 text-control font-semibold underline" data-testid="week-agent-card-settings">
        {cardTexts.settings}
      </button>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} actions={settings.actions} cost={settings.cost} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { ChevronRightIcon, SparkleIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";
import type { DiscardDraftInput, OkOrError } from "../actions/contract";
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
  /** A waiting proposal for the week (status draft), with its age worked out on the server; null or left out for none. */
  draft?: { id: string; freshness: "fresh" | "old" } | null;
  /** The proposal screen showing the waiting draft, without starting anything. */
  draftHref?: string;
  /** The proposal screen asked for a new proposal that ignores a waiting draft. */
  newHref?: string;
  /** Throws the draft away; left out: no Förkasta. */
  discard?: (input: DiscardDraftInput) => Promise<OkOrError & { code?: "no_draft" }>;
};

export function WeekAgentCard({ href, weekNumber, filledDays, emptyDays, settings, draft = null, draftHref, newHref, discard }: WeekAgentCardProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const on = useOption("weekAgent");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const state = cardState(filledDays, emptyDays);
  if (!on || state === "none" || state === "full") return null;
  const partial = state === "partial";

  async function throwAway() {
    if (!draft || !discard || busy) return;
    setBusy(true);
    try {
      const result = await discard({ draftId: draft.id });
      if (result.status === "ok") showToast(cardTexts.discarded);
      // Already gone (used, replaced elsewhere): the card is only refreshed.
      if (result.status === "ok" || result.code === "no_draft") {
        setConfirm(false);
        router.refresh();
      } else setNotice(result.message);
    } catch {
      setNotice("Det gick inte att förkasta. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  const discardButton = draft && discard ? (
    <button type="button" onClick={() => { setNotice(null); setConfirm(true); }} className="min-h-tap rounded-lg px-3.5 text-control underline" data-testid="week-agent-card-discard">
      {cardTexts.discard}
    </button>
  ) : null;
  const discardSheet = draft && discard ? (
    <Sheet
      open={confirm}
      onClose={() => setConfirm(false)}
      title={cardTexts.discardTitle}
      closeLabel={cardTexts.discardKeep}
      footer={
        <>
          <Button variant="danger-confirm" fullWidth disabled={busy} onClick={() => void throwAway()}>
            {cardTexts.discard}
          </Button>
          <Button variant="text" fullWidth onClick={() => setConfirm(false)}>
            {cardTexts.discardKeep}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink-2">{cardTexts.discardBody}</p>
      {notice ? <Notice role="alert">{notice}</Notice> : null}
    </Sheet>
  ) : null;

  if (draft?.freshness === "fresh") {
    return (
      <div data-testid="week-agent-card" data-state={state} data-draft="fresh" className="flex flex-col rounded-lg bg-mint text-mint-ink">
        <div className="flex items-start gap-3 p-3.5 pb-1">
          <SparkleIcon size={26} className="mt-0.5 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-headline">{cardTexts.waitingTitle}</span>
            <span className="text-control font-normal wrap-break-word opacity-90">{cardTexts.draftBody(weekNumber)}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-1 px-3.5 pb-2">
          <Link href={draftHref ?? href} data-testid="week-agent-card-link" className="inline-flex min-h-tap items-center rounded-lg bg-surface px-4 text-control font-semibold text-accent">
            {cardTexts.waitingOpen}
          </Link>
          <Link href={newHref ?? href} data-testid="week-agent-card-new" className="inline-flex min-h-tap items-center rounded-lg px-3.5 text-control font-semibold underline">
            {cardTexts.waitingNew}
          </Link>
          {discardButton}
        </div>
        {discardSheet}
      </div>
    );
  }

  return (
    <div data-testid="week-agent-card" data-state={state} className="flex flex-col rounded-lg bg-mint text-mint-ink">
      <Link href={href} data-testid="week-agent-card-link" className="flex items-start gap-3 rounded-lg p-3.5 pb-1">
        <SparkleIcon size={26} className="mt-0.5 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-headline">{draft ? cardTexts.oldTitle : partial ? cardTexts.partialTitle : cardTexts.emptyTitle}</span>
          <span className="text-control font-normal wrap-break-word opacity-90">{draft ? (partial ? cardTexts.partialTitle : cardTexts.emptyTitle) : partial ? cardTexts.partialBody(emptyDays.length, filledDays) : cardTexts.emptyBody(weekNumber)}</span>
        </span>
        <ChevronRightIcon size={20} className="shrink-0 self-center" />
      </Link>
      <div className="flex flex-wrap items-center">
        <button type="button" onClick={() => setSettingsOpen(true)} className="min-h-tap self-start rounded-lg px-3.5 text-control font-semibold underline" data-testid="week-agent-card-settings">
          {cardTexts.settings}
        </button>
        {discardButton}
      </div>
      {discardSheet}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} actions={settings.actions} cost={settings.cost} />
    </div>
  );
}

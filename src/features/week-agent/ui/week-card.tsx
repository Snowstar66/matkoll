"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { MoreIcon, SparkleIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";
import type { DiscardDraftInput, OkOrError } from "../actions/contract";
import type { CostTexts, SettingsActions } from "./actions";
import { cardState, cardTexts } from "./format";
import { SettingsSheet } from "./settings-sheet";

// Veckoagenten's way in on Matsedel (VK-A, VK-N1), now one quiet chip at the right of the heading "Veckans rätter" (UX-02; the route
// puts it there, "Äter ni ute?" stays in the chip row above): "Föreslå veckan" on an empty week, "Fyll resten" on a partly
// filled one, nothing on a full week (its way in is the ⋯ menu). A tap opens the sheet "Veckans inriktning"
// (settings.start): change what you want and start, or skip it and start with what is saved. Nothing runs by itself.
// With a fresh waiting draft the chip is "Öppna utkast" and a ⋯ beside it holds "Gör nytt" and "Förkasta". An old draft
// is left out of the row (a new proposal replaces it). Only with the Tillval Veckoagenten on (per device, so the page,
// which does not know it, always renders this and the chip hides itself).

/** The chip's look: 34 px high (taller only when the text has to wrap at 200 % zoom) with a 44 px tap area; the main one is mint, the only filled chip of the row. */
const chip = "relative inline-flex min-h-[34px] max-w-full min-w-0 items-center gap-1.5 rounded-pill px-3 py-1 text-control outline-none before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const mainChip = `${chip} bg-mint font-semibold text-mint-ink`;

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

export function WeekAgentCard({ href, filledDays, emptyDays, settings, draft = null, draftHref, newHref, discard }: WeekAgentCardProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const on = useOption("weekAgent");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  const state = cardState(filledDays, emptyDays);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRoot.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!on || state === "none" || state === "full") return null;
  const partial = state === "partial";
  const fresh = draft?.freshness === "fresh";
  const startLabel = partial ? cardTexts.startChipPartial : cardTexts.startChip;
  const intro = partial ? cardTexts.partialBody(emptyDays.length, filledDays) : cardTexts.startIntro;

  async function throwAway() {
    if (!draft || !discard || busy) return;
    setBusy(true);
    try {
      const result = await discard({ draftId: draft.id });
      if (result.status === "ok") showToast(cardTexts.discarded);
      // Already gone (used, replaced elsewhere): the row is only refreshed.
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

  const discardSheet = fresh && discard ? (
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

  if (fresh) {
    return (
      <>
        <Link href={draftHref ?? href} data-testid="week-agent-card-link" data-state={state} data-draft="fresh" className={mainChip}>
          <SparkleIcon size={16} className="shrink-0" />
          {cardTexts.openDraftChip}
        </Link>
        <div ref={menuRoot} className="relative flex">
          <button
            type="button"
            aria-label={cardTexts.moreForDraft}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid="week-agent-card-more"
            onClick={() => setMenuOpen((value) => !value)}
            className={`${chip} w-[34px] justify-center border border-border bg-surface px-0 text-ink-2`}
          >
            <MoreIcon size={18} />
          </button>
          {menuOpen ? (
            <div role="menu" aria-label={cardTexts.moreForDraft} className="absolute top-full right-0 z-30 mt-1 flex w-52 flex-col rounded-lg bg-surface py-1 shadow-float">
              <Link href={newHref ?? href} role="menuitem" data-testid="week-agent-card-new" className="flex min-h-tap items-center px-3.5 text-row-title text-ink">
                {cardTexts.waitingNew}
              </Link>
              {discard ? (
                <button
                  type="button"
                  role="menuitem"
                  data-testid="week-agent-card-discard"
                  onClick={() => {
                    setMenuOpen(false);
                    setNotice(null);
                    setConfirm(true);
                  }}
                  className="flex min-h-tap items-center border-t border-hairline px-3.5 text-left text-row-title text-ink"
                >
                  {cardTexts.discard}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {discardSheet}
      </>
    );
  }

  return (
    <>
      <button type="button" data-testid="week-agent-card-link" data-state={state} onClick={() => setSheetOpen(true)} className={mainChip}>
        <SparkleIcon size={16} className="shrink-0" />
        {startLabel}
      </button>
      <SettingsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        actions={settings.actions}
        cost={settings.cost}
        start={{
          label: startLabel,
          intro,
          onStart: () => {
            setSheetOpen(false);
            router.push(href);
          },
        }}
      />
    </>
  );
}

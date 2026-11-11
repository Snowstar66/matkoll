"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { FridgeIcon, LockIcon, LockOpenIcon, MoreIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { OfferTags } from "@/components/offer-tag";
import { Sheet } from "@/components/sheet";
import type { AlternativeOption } from "../actions/contract";
import type { ProposalDay, WeekProposal } from "../domain/types";
import type { WeekAgentActions } from "./actions";
import { allergyInitial, dayDate, dayLabel, dayWord } from "./format";

// The parts of the proposal screen (VK-F2, VK-F3, VK-N2, VK-N3): a day row with its reason, tags, allergy flag and
// lock, the sheet with other dishes for a day, and the small menu in the header.

/** A red ring with the person's letter and what it is: an allergy is never hidden and never only colour (VK-F3). */
export function AllergyFlag({ warning }: { warning: string }) {
  return (
    <span data-testid="allergy-flag" className="mt-1 flex items-center gap-2 text-danger">
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-danger text-control font-semibold">
        {allergyInitial(warning)}
      </span>
      <span className="min-w-0 text-control font-semibold wrap-break-word">{warning}</span>
    </span>
  );
}

const soonText = (tag: { expiresWeekday: number | null; estimated?: boolean; today?: boolean }): string => {
  if (!tag.expiresWeekday) return "Går ut snart";
  if (tag.today) return tag.estimated ? "Bör ätas idag" : "Går ut idag";
  return tag.estimated ? `Håller till ca ${dayWord(tag.expiresWeekday).slice(0, 3)}` : `Går ut ${dayWord(tag.expiresWeekday).slice(0, 3)}`;
};

export type ProposalRowProps = {
  weekStart: string;
  day: ProposalDay;
  /** The row is being re-rolled: a quiet placeholder while the new dish comes. */
  loading?: boolean;
  disabled?: boolean;
  onSwap: () => void;
  onToggleLock: () => void;
};

export function ProposalRow({ weekStart, day, loading = false, disabled = false, onSwap, onToggleLock }: ProposalRowProps) {
  const date = dayDate(weekStart, day.dayIndex);
  const own = day.source === "fixed";
  const lockedByUser = !own && day.locked;
  const word = dayWord(day.dayIndex);
  return (
    <li data-testid="proposal-day" data-day={day.dayIndex} data-source={day.source} aria-busy={loading || undefined} className={cx("grid grid-cols-[56px_1fr_auto] overflow-hidden rounded-md bg-surface", loading && "opacity-55")}>
      <div className={cx("flex flex-col items-center justify-center text-badge", own ? "bg-sand text-sand-ink" : "bg-mint text-mint-ink")}>
        <span className="font-semibold">{dayLabel(day.dayIndex)}</span>
        <span className="text-control font-normal">{date.day}</span>
      </div>
      <div className="min-w-0 py-2.5 pr-2 pl-3">
        <p className="text-row-title font-semibold wrap-break-word text-ink">{loading ? "Byter …" : day.title}</p>
        {!loading ? (
          <>
            {day.reasons.length > 0 ? <p className="text-meta text-ink-2">{day.reasons.slice(0, 2).join(" ")}</p> : null}
            <div className="flex flex-wrap items-center gap-1 pt-1">
              {own ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-0.5 text-badge font-semibold text-sand-ink">
                  <LockIcon size={12} />
                  Din rätt
                </span>
              ) : null}
              {lockedByUser ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-0.5 text-badge font-semibold text-sand-ink">
                  <LockIcon size={12} />
                  Låst av dig
                </span>
              ) : null}
              <OfferTags tags={day.offerTags} max={2} />
              {day.useSoonTags.slice(0, 2).map((tag) => (
                <span key={tag.name} data-testid="use-soon-tag" className="inline-flex items-center gap-1 rounded-full bg-deal px-2.5 py-0.5 text-badge font-medium text-deal-ink">
                  <FridgeIcon size={12} />
                  {soonText(tag)}
                </span>
              ))}
            </div>
            {day.allergyWarning ? <AllergyFlag warning={day.allergyWarning} /> : null}
          </>
        ) : null}
      </div>
      <div className="flex flex-col items-center justify-start gap-0.5 py-1 pr-1">
        {own ? (
          <span role="img" aria-label={`${word}: din rätt, den ligger kvar`} className="flex size-tap items-center justify-center text-accent">
            <LockIcon size={20} />
          </span>
        ) : (
          <>
            {day.locked ? null : (
              <Button variant="compact" disabled={disabled || loading} onClick={onSwap} aria-label={`Byt ${word}`} className="rounded-full border border-border bg-surface">
                Byt
              </Button>
            )}
            <button
              type="button"
              aria-pressed={day.locked}
              aria-label={day.locked ? `Lås upp ${word}` : `Lås ${word}`}
              disabled={disabled || loading}
              onClick={onToggleLock}
              className={cx("flex size-tap items-center justify-center rounded-full disabled:opacity-60", day.locked ? "text-accent" : "text-ink-3")}
            >
              {day.locked ? <LockIcon size={20} /> : <LockOpenIcon size={20} />}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** The sheet over the proposal with other dishes for one day (VK-F3). One that holds an allergen is marked red and chosen with "Välj ändå". */
export function AlternativesSheet({
  open,
  onClose,
  draftId,
  dayIndex,
  actions,
  onChosen,
  onNoDraft,
}: {
  open: boolean;
  onClose: () => void;
  draftId: string;
  dayIndex: number;
  actions: WeekAgentActions;
  /** The proposal after the swap. */
  onChosen: (proposal: WeekProposal) => void;
  /** The draft is gone (answer code no_draft): the screen reads the week again. */
  onNoDraft: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={`Byt ${dayWord(dayIndex)}`} closeLabel="Avbryt" preventClose={choosing}>
      {/* Mounted only while the sheet is open, so each opening starts a fresh read. */}
      <AlternativesList draftId={draftId} dayIndex={dayIndex} actions={actions} onChosen={onChosen} onChoosing={setChoosing} onNoDraft={onNoDraft} />
    </Sheet>
  );
}

function AlternativesList({ draftId, dayIndex, actions, onChosen, onChoosing, onNoDraft }: { onNoDraft: () => void; draftId: string; dayIndex: number; actions: WeekAgentActions; onChosen: (proposal: WeekProposal) => void; onChoosing: (choosing: boolean) => void }) {
  const [options, setOptions] = useState<AlternativeOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const { alternatives } = actions;

  useEffect(() => {
    let live = true;
    alternatives({ draftId, dayIndex }).then(
      (result) => {
        if (!live) return;
        if (result.status === "ok") setOptions(result.options);
        else if (result.code === "no_draft") onNoDraft();
        else setError(result.message);
      },
      () => live && setError("Det gick inte att hämta andra rätter. Försök igen."),
    );
    return () => {
      live = false;
    };
  }, [draftId, dayIndex, alternatives]);

  async function choose(recipeId: string) {
    if (choosing) return;
    setChoosing(recipeId);
    onChoosing(true);
    setError(null);
    try {
      const result = await actions.swap({ draftId, dayIndex, recipeId });
      if (result.status === "ok") {
        onChosen(result.proposal);
        return;
      }
      if (result.code === "no_draft") onNoDraft();
      else setError(result.message);
    } catch {
      setError("Det gick inte att byta. Försök igen.");
    } finally {
      setChoosing(null);
      onChoosing(false);
    }
  }

  return (
    <>
      {error ? (
        <div className="mb-3">
          <Notice role="alert">{error}</Notice>
        </div>
      ) : null}
      {options === null && !error ? (
        <p role="status" className="py-6 text-center text-body text-ink-2">
          Letar bland dina recept …
        </p>
      ) : null}
      {options && options.length === 0 ? <p className="py-6 text-center text-body text-ink-2">Inga andra recept passar den här dagen.</p> : null}
      {options && options.length > 0 ? (
        <>
          <ul className="flex flex-col divide-y divide-hairline" data-testid="alternatives">
            {options.map((option) => (
              <li key={option.recipeId} data-testid="alternative" className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-row-title font-semibold wrap-break-word text-ink">{option.title}</p>
                  {option.reasons.length > 0 ? <p className="text-meta text-ink-2">{option.reasons.slice(0, 2).join(" ")}</p> : null}
                  {option.allergyWarning ? <AllergyFlag warning={option.allergyWarning} /> : null}
                </div>
                <Button
                  variant={option.allergyWarning ? "compact" : "compact-primary"}
                  disabled={choosing !== null}
                  onClick={() => choose(option.recipeId)}
                  aria-label={`${option.allergyWarning ? "Välj ändå" : "Välj"} ${option.title}`}
                  className={option.allergyWarning ? "rounded-full border border-border bg-surface" : undefined}
                >
                  {option.allergyWarning ? "Välj ändå" : "Välj"}
                </Button>
              </li>
            ))}
          </ul>
          <p className="pt-3 text-meta text-ink-3">Recept med en allergi visas alltid och är märkta. De väljs aldrig av förslaget, bara av dig.</p>
        </>
      ) : null}
    </>
  );
}

export type MenuItem = { id: string; title: string; hint?: string; icon: ReactNode; onSelect: () => void; danger?: boolean };

/** The ⋯ in the proposal's header (VK-N3): Gör noggrannare, Ställ in, Släng utkast. Closes with Esc, a tap outside or a choice. */
export function HeaderMenu({ label, items, disabled = false }: { label: string; items: readonly MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    toggle.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") setOpen(false);
  }

  return (
    <div ref={root} className="relative flex">
      <button
        ref={toggle}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        data-testid="proposal-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex size-tap items-center justify-center rounded-full text-accent disabled:opacity-60"
      >
        <MoreIcon size={26} />
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label={label} onKeyDown={onKeyDown} className="absolute top-full right-0 z-30 flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-lg bg-surface py-1 shadow-float">
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={index === 0 ? first : undefined}
              type="button"
              role="menuitem"
              data-testid={`proposal-menu-${item.id}`}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cx("flex min-h-tap items-start gap-3 px-3.5 py-3 text-left", index > 0 && "border-t border-hairline", item.danger ? "text-danger" : "text-accent")}
            >
              <span className="mt-0.5 shrink-0">{item.icon}</span>
              <span className={cx("flex flex-col", item.danger ? "text-danger" : "text-ink")}>
                <span className="text-row-title">{item.title}</span>
                {item.hint ? <span className="text-meta text-ink-2">{item.hint}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

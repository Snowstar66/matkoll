"use client";

import { useState } from "react";
import { cx } from "@/components/cx";
import { type FitDot, fitDots } from "@/components/fit-dots";
import { PreferenceNotes, type PreferenceNote } from "@/components/preference-notes";
import { useOption } from "@/lib/use-option";

/** Most dots in one row; an allergy dot is never cut. */
const maxDots = 5;

const dotStyle: Record<FitDot["kind"], string> = {
  love: "bg-mint text-mint-ink",
  avoid: "border-[1.5px] border-dashed border-sand-ink bg-sand text-sand-ink",
  allergy: "border-[2.5px] border-danger bg-surface text-danger",
};

function Dot({ dot }: { dot: FitDot }) {
  return (
    <span role="img" aria-label={dot.label} data-kind={dot.kind} data-testid="fit-dot" className={cx("inline-grid size-[26px] shrink-0 place-items-center rounded-full text-[0.875rem]/none font-semibold", dotStyle[dot.kind])}>
      <span aria-hidden>{dot.initial}</span>
    </span>
  );
}

function DotRow({ dots }: { dots: readonly FitDot[] }) {
  const words = [...new Set(dots.flatMap((dot) => dot.words))];
  return (
    <>
      <span className="inline-flex items-center gap-1">
        {dots.map((dot) => (
          <Dot key={dot.personId} dot={dot} />
        ))}
      </span>
      {words.length > 0 ? (
        <span data-testid="fit-allergy-word" className="text-[0.875rem]/[18px] font-semibold text-danger">
          {words.join(", ")}
        </span>
      ) : null}
    </>
  );
}

/**
 * FitRow: who a dish suits, as small round initials, only for those who stand out (Tillval Visa vem rätten passar):
 * mint is a lover, sand is an avoider, a red ring with the allergen word is an allergy. Nobody neutral is shown and a dish
 * that fits everyone has no row at all. It replaces the grey and green lines of PreferenceNotes (the allergy too, as the
 * red ring and word); with the option off, the notes are shown as before. `expandable` (the recipe page) makes the whole
 * row a button that opens the sentences ("Anna älskar fetaost. Gunnar undviker vitlök."); elsewhere the row is plain, so a
 * tap goes on to the card's own link.
 */
export function FitRow({ notes, maxNotes, expandable = false, className }: { notes: readonly PreferenceNote[] | undefined; maxNotes?: number; expandable?: boolean; className?: string }) {
  const on = useOption("showFit");
  const [open, setOpen] = useState(false);
  if (!on) return <PreferenceNotes notes={notes} max={maxNotes} className={className} />;
  const dots = fitDots(notes, maxDots);
  if (dots.length === 0) return null;
  if (!expandable) {
    return (
      <span data-testid="fit-row" className={cx("flex min-h-[26px] min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1", className)}>
        <DotRow dots={dots} />
      </span>
    );
  }
  return (
    <div data-testid="fit-row" className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-full items-center gap-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <DotRow dots={dots} />
        <span className="text-meta text-ink-3">{open ? "Dölj" : "Tryck för mer"}</span>
      </button>
      {open ? (
        <ul data-testid="fit-details" className="mb-1 flex flex-col gap-1 rounded-lg bg-surface px-3.5 py-3 text-[0.9375rem]/5 text-ink-2">
          {dots.map((dot) => (
            <li key={dot.personId} className={dot.kind === "allergy" ? "font-semibold text-danger" : undefined}>
              {dot.label}
              {dot.kind === "allergy" ? "" : "."}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

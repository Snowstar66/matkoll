"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/cx";
import { type FitDot, fitDots } from "@/components/fit-dots";
import { PreferenceNotes, type PreferenceNote } from "@/components/preference-notes";
import { useChoice } from "@/lib/use-option";

/** Most dots in one row; an allergy dot is never cut. */
const maxDots = 5;

const dotStyle: Record<FitDot["kind"], string> = {
  love: "bg-mint text-mint-ink",
  avoid: "border-[1.5px] border-dashed border-sand-ink bg-sand text-sand-ink",
  allergy: "border-[2.5px] border-danger bg-surface text-danger",
};

type Anchor = { left: number; top: number };

function Dot({ dot, open, onOpen, onClose }: { dot: FitDot; open: boolean; onOpen: (anchor: Anchor) => void; onClose: () => void }) {
  const pointer = useRef("touch");
  const show = (element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    onOpen({ left: box.left + box.width / 2, top: box.bottom + 4 });
  };
  return (
    <button
      type="button"
      aria-label={dot.label}
      aria-expanded={open}
      data-kind={dot.kind}
      data-testid="fit-dot"
      onPointerDown={(event) => {
        pointer.current = event.pointerType;
      }}
      onClick={(event) => {
        // The dot sits on cards that are links: a tap here is for the bubble only.
        event.preventDefault();
        event.stopPropagation();
        if (open && pointer.current !== "mouse") onClose();
        else show(event.currentTarget);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") show(event.currentTarget);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onClose();
      }}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) show(event.currentTarget);
      }}
      onBlur={onClose}
      className="-m-[3px] inline-grid shrink-0 place-items-center rounded-full p-[3px] outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
    >
      <span aria-hidden className={cx("inline-grid size-[26px] place-items-center rounded-full text-[0.875rem]/none font-semibold", dotStyle[dot.kind])}>
        {dot.initial}
      </span>
    </button>
  );
}

function Bubble({ dot, anchor }: { dot: FitDot; anchor: Anchor }) {
  const width = typeof window === "undefined" ? 320 : window.innerWidth;
  const left = Math.min(Math.max(anchor.left, 130), Math.max(width - 130, 130));
  return createPortal(
    <div
      role="status"
      data-testid="fit-bubble"
      style={{ left, top: anchor.top }}
      className={cx(
        "pointer-events-none fixed z-50 max-w-[240px] -translate-x-1/2 rounded-lg bg-surface px-3 py-2 text-[0.9375rem]/5 shadow-lg ring-1 ring-border",
        dot.kind === "allergy" ? "font-semibold text-danger" : "text-ink-2",
      )}
    >
      {dot.label}
    </div>,
    document.body,
  );
}

function DotRow({ dots }: { dots: readonly FitDot[] }) {
  const words = [...new Set(dots.flatMap((dot) => dot.words))];
  const [openId, setOpenId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const row = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpenId(null), []);
  useEffect(() => {
    if (openId === null) return;
    const outside = (event: Event) => {
      if (!row.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", close, true);
    };
  }, [openId, close]);
  const openDot = dots.find((dot) => dot.personId === openId);
  return (
    <>
      <span ref={row} className="inline-flex items-center gap-1.5">
        {dots.map((dot) => (
          <Dot
            key={dot.personId}
            dot={dot}
            open={openId === dot.personId}
            onOpen={(next) => {
              setAnchor(next);
              setOpenId(dot.personId);
            }}
            onClose={close}
          />
        ))}
      </span>
      {openDot && anchor ? <Bubble dot={openDot} anchor={anchor} /> : null}
      {words.length > 0 ? (
        <span data-testid="fit-allergy-word" className="text-[0.875rem]/[18px] font-semibold text-danger">
          {words.join(", ")}
        </span>
      ) : null}
    </>
  );
}

/**
 * FitRow: who a dish suits (Tillval Visa vem rätten passar, three ways per device). "Prickar" (default): small round
 * initials only for those who stand out, mint is a lover, sand an avoider, a red ring with the allergen word an allergy;
 * nobody neutral is shown, a dish that fits everyone has no row. A dot is a button: a tap (or hover or keyboard focus)
 * opens a small bubble with the sentence ("Anna älskar fetaost"); it never follows the card's own link. "Text": the grey
 * and green lines of PreferenceNotes as before, allergies in red. "Inget": nothing here (allergy warnings elsewhere,
 * like the week line, stay).
 */
export function FitRow({ notes, maxNotes, className }: { notes: readonly PreferenceNote[] | undefined; maxNotes?: number; className?: string }) {
  const mode = useChoice("showFit");
  if (mode === "none") return null;
  if (mode === "text") return <PreferenceNotes notes={notes} max={maxNotes} className={className} />;
  const dots = fitDots(notes, maxDots);
  if (dots.length === 0) return null;
  return (
    <span data-testid="fit-row" className={cx("flex min-h-[26px] min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1", className)}>
      <DotRow dots={dots} />
    </span>
  );
}

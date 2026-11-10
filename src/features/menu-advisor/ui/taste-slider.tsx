"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { cx } from "@/components/cx";
import type { Taste } from "../domain/profile";

// The two-way slider of one taste: five snap positions from Ogillar via Okej to Älskar, no numbers. A 44 px handle on
// a slim track; a tap or a drag snaps to the nearest position (the middle holds like a magnet, since every position
// is a snap). Vertical swipes still scroll the page (touch-action: pan-y); a drag is only kept while it is horizontal.
// role="slider" with the arrow keys, Home and End.

export const tasteSteps: readonly Taste[] = [-2, -1, 0, 1, 2];
export const tasteStepLabels: Readonly<Record<Taste, string>> = { [-2]: "Ogillar", [-1]: "Hellre inte", 0: "Okej", 1: "Gillar", 2: "Älskar" };

const stepOf = (taste: Taste) => tasteSteps.indexOf(taste);

export function TasteSlider({ label, value, onChange, disabled = false }: { label: string; value: Taste; onChange: (taste: Taste) => void; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  // While a finger is down the handle follows it; the change is saved when it is lifted.
  const [drag, setDrag] = useState<Taste | null>(null);
  const shown = drag ?? value;
  const index = stepOf(shown);
  const percent = index * 25;

  function tasteAt(clientX: number): Taste {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return value;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return tasteSteps[Math.round(ratio * 4)]!;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag(tasteAt(event.clientX));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (drag === null) return;
    setDrag(tasteAt(event.clientX));
  }

  function release(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    if (drag === null) return;
    const final = commit ? tasteAt(event.clientX) : drag;
    setDrag(null);
    if (commit && final !== value) onChange(final);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(4, stepOf(value) + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(0, stepOf(value) - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 4;
    if (next === null) return;
    event.preventDefault();
    const taste = tasteSteps[next]!;
    if (taste !== value) onChange(taste);
  }

  const negative = shown < 0;
  const positive = shown > 0;
  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={-2}
      aria-valuemax={2}
      aria-valuenow={shown}
      aria-valuetext={tasteStepLabels[shown]}
      aria-disabled={disabled || undefined}
      data-testid="taste-slider"
      data-taste={shown}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => release(event, true)}
      onPointerCancel={(event) => release(event, false)}
      style={{ touchAction: "pan-y" }}
      className="relative h-tap w-full cursor-pointer select-none rounded-pill outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/* The rail runs between the centres of the first and last position, so the handle never leaves the row. */}
      <div ref={track} className="pointer-events-none absolute inset-x-[22px] inset-y-0">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-pill bg-fill" />
        {negative ? <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-pill bg-sand-ink/50" style={{ left: `${percent}%`, right: "50%" }} /> : null}
        {positive ? <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-pill bg-accent/60" style={{ left: "50%", right: `${100 - percent}%` }} /> : null}
        {tasteSteps.map((step, position) => (
          <span
            key={step}
            aria-hidden="true"
            className={cx("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ink-3/60", step === 0 ? "h-3.5 w-0.5 bg-ink-3" : "size-1")}
            style={{ left: `${position * 25}%` }}
          />
        ))}
        <span
          aria-hidden="true"
          data-testid="taste-handle"
          className={cx(
            "absolute top-1/2 size-tap -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface shadow-sm transition-[left] duration-150 motion-reduce:transition-none",
            drag !== null && "transition-none",
            negative ? "border-sand-ink" : positive ? "border-accent" : "border-border",
          )}
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  );
}

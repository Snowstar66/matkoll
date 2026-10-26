"use client";

import { cx } from "./cx";
import { MinusIcon, PlusIcon } from "./icons";

export type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  /** Lowest value; never below 1. */
  min?: number;
  /** Highest value, if any; + is unavailable there. */
  max?: number;
  /** The value in words; defaults to "1 portion" / "N portioner". */
  format?: (value: number) => string;
  decreaseLabel?: string;
  increaseLabel?: string;
  className?: string;
};

export function formatPortions(n: number): string {
  return n === 1 ? "1 portion" : `${n} portioner`;
}

const stepButton =
  "flex size-tap shrink-0 items-center justify-center rounded-full text-accent aria-disabled:cursor-not-allowed aria-disabled:text-ink-3";

/** Portionsväljare: − and + in steps of 1, never below 1 (or `min`) nor above `max`. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max,
  format = formatPortions,
  decreaseLabel = "Färre portioner",
  increaseLabel = "Fler portioner",
  className,
}: StepperProps) {
  const floor = Math.max(1, Number.isFinite(min) ? Math.floor(min) : 1);
  const ceiling = max !== undefined && Number.isFinite(max) ? Math.max(floor, Math.floor(max)) : Infinity;
  // A value outside the range (0, negative, NaN, above max) is shown, and stepped from, as its nearest end.
  const shown = Number.isFinite(value) ? Math.min(ceiling, Math.max(floor, value)) : floor;
  const atMin = shown <= floor;
  const atMax = shown >= ceiling;

  return (
    <div className={cx("inline-flex min-h-tap max-w-full items-center rounded-full bg-surface", className)}>
      {/* aria-disabled instead of disabled keeps the button in the tab order and focused. */}
      <button
        type="button"
        aria-label={decreaseLabel}
        aria-disabled={atMin || undefined}
        onClick={() => {
          if (!atMin) onChange(Math.max(floor, shown - 1));
        }}
        className={stepButton}
      >
        <MinusIcon size={20} />
      </button>
      <output aria-live="polite" className="min-w-0 px-1 min-[22rem]:min-w-24 text-center text-body font-semibold break-words text-ink">
        {format(shown)}
      </output>
      <button
        type="button"
        aria-label={increaseLabel}
        aria-disabled={atMax || undefined}
        onClick={() => {
          if (!atMax) onChange(Math.min(ceiling, shown + 1));
        }}
        className={stepButton}
      >
        <PlusIcon size={20} />
      </button>
    </div>
  );
}

"use client";

import { cx } from "./cx";
import { MinusIcon, PlusIcon } from "./icons";

export type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  /** Lowest value; never below 1. */
  min?: number;
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
  "flex size-tap items-center justify-center rounded-full text-accent aria-disabled:cursor-not-allowed aria-disabled:text-ink-3";

/** Portionsväljare: − and + in steps of 1, never below 1. */
export function Stepper({
  value,
  onChange,
  min = 1,
  format = formatPortions,
  decreaseLabel = "Färre portioner",
  increaseLabel = "Fler portioner",
  className,
}: StepperProps) {
  const floor = Math.max(1, Number.isFinite(min) ? Math.floor(min) : 1);
  // A value below the floor (0, negative, NaN) is shown, and stepped from, as the floor.
  const shown = Number.isFinite(value) ? Math.max(floor, value) : floor;
  const atMin = shown <= floor;

  return (
    <div className={cx("inline-flex h-tap items-center rounded-full bg-surface", className)}>
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
      <output aria-live="polite" className="min-w-24 px-1 text-center text-body font-semibold text-ink">
        {format(shown)}
      </output>
      <button type="button" aria-label={increaseLabel} onClick={() => onChange(shown + 1)} className={stepButton}>
        <PlusIcon size={20} />
      </button>
    </div>
  );
}

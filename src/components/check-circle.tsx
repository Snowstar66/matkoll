"use client";

import { cx } from "./cx";
import { CheckIcon } from "./icons";

export type CheckCircleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** What is ticked off, e.g. "Paprika, röd, 1 st". The state is read out as checked / not checked. */
  label: string;
  /** Cannot be ticked now (e.g. the saved state could not be read); still named and shown. */
  disabled?: boolean;
  /** Ids of what the screen reader reads after the name and state, e.g. the line under the item's name. */
  describedBy?: string;
  className?: string;
};

/** The round tick of a list item: 26 px visible circle in a 44 px tap area. */
export function CheckCircle({ checked, onCheckedChange, label, disabled, describedBy, className }: CheckCircleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy || undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cx("flex size-tap shrink-0 items-center justify-center rounded-full disabled:opacity-50", className)}
    >
      <span
        className={cx(
          "flex size-[26px] items-center justify-center rounded-full border-2",
          checked ? "border-accent bg-accent text-on-accent" : "border-ink-3 bg-surface",
        )}
      >
        {checked ? <CheckIcon size={15} /> : null}
      </span>
    </button>
  );
}

"use client";

import { cx } from "./cx";
import { CheckIcon } from "./icons";

export type CheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** What is picked, e.g. "Aubergine, 12 kr per kg". The state is read out as checked / not checked. */
  label: string;
  disabled?: boolean;
  /** Id(s) of the text that describes it, e.g. the line under a list item. */
  describedBy?: string;
  className?: string;
};

/** A square tick box for picking among many (not the round "i korgen" circle): 22 px visible box in a 44 px tap area. */
export function Checkbox({ checked, onCheckedChange, label, disabled, describedBy, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy || undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cx("flex size-tap shrink-0 items-center justify-center rounded-md disabled:opacity-50", className)}
    >
      <span
        className={cx(
          "flex size-[22px] items-center justify-center rounded-[6px] border-2",
          checked ? "border-accent bg-accent text-on-accent" : "border-ink-3 bg-surface",
        )}
      >
        {checked ? <CheckIcon size={14} /> : null}
      </span>
    </button>
  );
}

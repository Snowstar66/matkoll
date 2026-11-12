"use client";

import { useId } from "react";
import { cx } from "./cx";

/**
 * A row with a switch, as in Inställningar → Tillval: the label, a quiet hint under it, and the
 * switch at the right. The whole row is the switch (`role="switch"`), at least 56 px high.
 */
export function SwitchRow({
  label,
  hint,
  on,
  onToggle,
  disabled = false,
  id,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** An anchor for a link that leads to this row (#id). */
  id?: string;
}) {
  const hintId = useId();
  return (
    <li id={id} className="scroll-mt-4">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        onClick={onToggle}
        className={cx("flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left", disabled && "opacity-50")}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body text-ink">{label}</span>
          {hint ? (
            <span id={hintId} className="text-meta text-ink-2">
              {hint}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={cx("relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors", on ? "bg-accent" : "border border-border bg-fill")}
        >
          <span className={cx("absolute top-0.5 size-[22px] rounded-full shadow transition-[left]", on ? "left-[20px] bg-on-accent" : "left-0.5 bg-surface")} />
        </span>
      </button>
    </li>
  );
}

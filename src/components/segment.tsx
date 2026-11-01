"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { ReservedLabel } from "./chip";
import { cx } from "./cx";

export type SegmentOption<T extends string> = {
  value: T;
  /** The name, also for screen readers when only an icon is drawn. */
  label: string;
  /** A decorative glyph before the label (or instead of it with `iconOnly`). */
  icon?: ReactNode;
  iconOnly?: boolean;
  disabled?: boolean;
};

export type SegmentProps<T extends string> = {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** 46 px segments, for two-line labels. */
  tall?: boolean;
  /** "small": the quiet icon switch beside a count (28 px plates, 36 px wide, 44 px tap area). */
  size?: "default" | "small";
  className?: string;
};

const nextKeys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Segment (Story 19.3): the one look of a switch between views of the same thing. A radio group
 * on a `--seg-track` rail (corner 12, 3 px air); the chosen segment is a `--seg-on` plate with a
 * hairline and 600 text. 40 px visible (46 tall), a 44 px tap area. Only the chosen segment is in
 * the tab order; the arrow keys, Home and End move the choice.
 */
export function Segment<T extends string>({ label, options, value, onChange, disabled = false, tall = false, size = "default", className }: SegmentProps<T>) {
  const small = size === "small";
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chosenIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function choose(index: number, moveFocus = false) {
    const option = options[index];
    if (!option || option.disabled) return;
    if (moveFocus) refs.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = options.length;
    let target: number | null = null;
    if (event.key in nextKeys) target = (index + nextKeys[event.key] + count) % count;
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = count - 1;
    if (target === null) return;
    event.preventDefault();
    choose(target, true);
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx("flex min-w-0 max-w-full items-stretch gap-0.5 bg-seg-track", small ? "rounded-[10px] p-0.5" : "rounded-md p-[3px]", className)}>
      {options.map((option, index) => {
        const selected = index === chosenIndex;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.iconOnly ? option.label : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              "relative flex min-w-0 items-center justify-center gap-1 border text-control outline-none",
              small ? "h-7 w-9 rounded-lg" : cx("flex-1 rounded-[9px] px-3", tall ? "min-h-[46px]" : "h-10"),
              small ? "before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']" : "before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-['']",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60",
              selected ? "border-border bg-seg-on font-semibold text-ink" : "border-transparent font-medium text-ink-2",
            )}
          >
            {option.icon ? (
              <span aria-hidden="true" className="flex items-center leading-none">
                {option.icon}
              </span>
            ) : null}
            {option.iconOnly ? null : <ReservedLabel>{option.label}</ReservedLabel>}
          </button>
        );
      })}
    </div>
  );
}

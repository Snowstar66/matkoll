"use client";

import { type KeyboardEvent, useRef } from "react";
import { cx } from "./cx";

export type FilterOption<T extends string> = { value: T; label: string };

export type FilterPillsProps<T extends string> = {
  /** Name of the group for screen readers, e.g. "Filter". */
  label: string;
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Every pill unavailable, e.g. before hydration, when a tap would do nothing. */
  disabled?: boolean;
  className?: string;
  /** "compact": 32 px pills in one row that scrolls sideways instead of wrapping (Story 16.9). The tap area stays 44 px. */
  compact?: boolean;
  /**
   * "segmented" (Story 16.11): one rounded 32 px container with a hairline border and equal
   * segments; the chosen one is an accent chip, the rest plain text. Each segment keeps a 44 px
   * tap area (it reaches 6 px above and below the container).
   */
  segmented?: boolean;
};

const nextKeys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Filterpiller: exactly one option is chosen, so it is a radio group. Only the
 * chosen pill is in the tab order; the arrow keys (and Home/End) move the choice.
 * The visible pill is 34 px, the tap area 44 px.
 */
export function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  className,
  compact = false,
  segmented = false,
}: FilterPillsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chosenIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function choose(index: number, moveFocus = false) {
    const option = options[index];
    if (!option) return;
    // Only the arrow keys move focus; a tap already has it, and focus the keyboard did not ask for would draw a ring.
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

  if (segmented) {
    return (
      <div
        role="radiogroup"
        aria-label={label}
        className={cx("flex h-8 min-w-0 max-w-full items-stretch gap-0.5 rounded-md border border-border bg-bg p-0.5", className)}
      >
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
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => choose(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cx(
                "relative flex min-w-0 items-center justify-center rounded-sm px-3 text-meta font-semibold whitespace-nowrap outline-none",
                "before:absolute before:inset-x-0 before:-inset-y-[9px]before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60",
                selected ? "bg-accent text-on-accent" : "text-ink-2",
              )}
            >
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx("flex gap-2", compact ? "flex-nowrap gap-1 overflow-x-auto" : "flex-wrap", className)}>
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
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="group flex min-h-tap shrink-0 items-center rounded-pill outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              className={cx(
                "flex items-center rounded-pill text-meta font-semibold group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent",
                compact ? "h-8 px-3" : "h-[34px] px-[14px]",
                selected ? "bg-accent text-on-accent" : "bg-surface text-ink-2",
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

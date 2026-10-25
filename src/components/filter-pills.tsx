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
  className?: string;
};

const nextKeys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Filterpiller: exactly one option is chosen, so it is a radio group. Only the
 * chosen pill is in the tab order; the arrow keys (and Home/End) move the choice.
 * The visible pill is 34 px, the tap area 44 px.
 */
export function FilterPills<T extends string>({ label, options, value, onChange, className }: FilterPillsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chosenIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    refs.current[index]?.focus();
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
    choose(target);
  }

  return (
    <div role="radiogroup" aria-label={label} className={cx("flex flex-wrap gap-2", className)}>
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
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="flex min-h-tap items-center rounded-pill"
          >
            <span
              className={cx(
                "flex h-[34px] items-center rounded-pill px-[14px] text-meta font-semibold",
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

"use client";

import { type KeyboardEvent, useRef } from "react";
import { Chip } from "./chip";
import { cx } from "./cx";
import { Segment } from "./segment";

export type FilterOption<T extends string> = {
  value: T;
  label: string;
  /** A decorative glyph before the label (Story 14.4, and the category chips of Story 18.15); the label is the name. */
  icon?: string;
  /** Story 17.5: this one cannot be chosen (e.g. a provider without its key); the others can. */
  disabled?: boolean;
};

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
  /** Deprecated: renders a `Segment` (Story 19.3). New code uses `Segment` directly. */
  segmented?: boolean;
  /** With `segmented` (Story 16.17): the taller choice for a form, a `Segment` with 46 px segments. */
  tall?: boolean;
  /** The id of the text that describes the group, e.g. a hint under it. */
  describedBy?: string;
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
  tall = false,
  describedBy,
}: FilterPillsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chosenIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function choose(index: number, moveFocus = false) {
    const option = options[index];
    if (!option || option.disabled) return;
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
    return <Segment label={label} options={options} value={value} onChange={onChange} disabled={disabled} tall={tall} className={className} />;
  }

  return (
    <div role="radiogroup" aria-label={label} aria-describedby={describedBy} className={cx("flex gap-x-2", compact ? "flex-nowrap overflow-x-auto" : "flex-wrap", className)}>
      {options.map((option, index) => {
        const selected = index === chosenIndex;
        return (
          <Chip
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            role="radio"
            aria-checked={selected}
            selected={selected}
            icon={option.icon}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.label}
          </Chip>
        );
      })}
    </div>
  );
}

"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { CheckIcon } from "./icons";
import { cx } from "./cx";

export type ChoiceRowOption<T extends string> = {
  value: T;
  label: string;
  /** A quiet second line, e.g. what a choice means or how much is in it. */
  detail?: ReactNode;
  disabled?: boolean;
  /** For tests: the row's `data-testid`. */
  testId?: string;
};

export type ChoiceRowsProps<T extends string> = {
  /** Name of the group for screen readers. */
  label: string;
  options: readonly ChoiceRowOption<T>[];
  /** The chosen option; `null` when none is (e.g. "Kopiera till", where a tap acts at once). */
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** "action": each row is a plain button that does something when tapped; no check, no radio. */
  kind?: "choice" | "action";
  className?: string;
};

const nextKeys: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/**
 * Val med bock (Story 19.5): a choice among more than about four options, in a sheet or a form.
 * White rows with hairline dividers; the chosen row has no background, only a green check on the
 * right. A radio group: only the chosen row is in the tab order, and the arrow keys move the choice.
 * With `kind="action"` the rows are buttons that act at once (copy to a week, pick a store).
 */
export function ChoiceRows<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  kind = "choice",
  className,
}: ChoiceRowsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const isChoice = kind === "choice";
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
    if (!isChoice) return;
    const count = options.length;
    let target: number | null = null;
    if (event.key in nextKeys)
      target = (index + nextKeys[event.key] + count) % count;
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = count - 1;
    if (target === null) return;
    event.preventDefault();
    choose(target, true);
  }

  return (
    <div
      role={isChoice ? "radiogroup" : "group"}
      aria-label={label}
      className={cx(
        "flex flex-col divide-y divide-hairline overflow-hidden rounded-lg bg-surface",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = isChoice && option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role={isChoice ? "radio" : undefined}
            aria-checked={isChoice ? selected : undefined}
            tabIndex={isChoice ? (index === chosenIndex ? 0 : -1) : undefined}
            disabled={disabled || option.disabled}
            data-testid={option.testId}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="flex min-h-row w-full items-center justify-between gap-3 px-4 py-2 text-left outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex min-w-0 flex-col">
              <span
                className={cx(
                  "text-item break-words text-ink",
                  selected && "font-medium",
                )}
              >
                {option.label}
              </span>
              {option.detail ? (
                <span className="text-meta break-words text-ink-2">
                  {option.detail}
                </span>
              ) : null}
            </span>
            {selected ? (
              <CheckIcon
                size={22}
                aria-hidden="true"
                className="shrink-0 text-accent"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

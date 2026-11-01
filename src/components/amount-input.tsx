"use client";

import type { Ref } from "react";
import { MinusIcon, PlusIcon } from "./icons";
import { cx } from "./cx";

export type AmountInputProps = {
  id: string;
  /** The amount as typed ("1,5"). */
  value: string;
  onChange: (text: string) => void;
  /**
   * With a stepper (− n +, Story 19.5): for things that are counted (st, förp, kruka, klyfta, burk).
   * Without one the amount is a field with the unit after it (g, dl, ml …), where a step of 1 means little.
   */
  stepper: boolean;
  /** Steps the text by one unit step; `null` from `canStep` disables the button. */
  onStep: (direction: 1 | -1) => void;
  canStepDown: boolean;
  canStepUp: boolean;
  /** The unit shown after the field (only without a stepper). */
  unit?: string;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** The accessible name of the number field; "Mängd" by default. */
  label?: string;
  maxLength?: number;
  className?: string;
};

const stepButton =
  "flex w-14 flex-none items-center justify-center text-accent outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";
const numberClasses =
  "min-w-0 bg-surface text-center text-step font-medium tabular-nums text-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:bg-sky";

/**
 * The amount of a quantity (Story 19.5), shared by Lagervara, a list line's own item and Markera
 * som lagad: the stepper of Story 16.17 (− n +, the number can be typed too) for counted units, and
 * a plain number field with the unit after it for measures. The caller owns the text and the step
 * (see `stepAmountField` in the pantry's form rules). As wide as its content (`.stepper`, align-self:
 * flex-start in premium-look), also in a column of fields, where it would otherwise stretch.
 */
export function AmountInput({
  id,
  value,
  onChange,
  stepper,
  onStep,
  canStepDown,
  canStepUp,
  unit,
  onBlur,
  invalid = false,
  describedBy,
  autoFocus,
  inputRef,
  label = "Mängd",
  maxLength,
  className,
}: AmountInputProps) {
  const number = (
    <input
      ref={inputRef}
      id={id}
      aria-label={label}
      inputMode="decimal"
      autoComplete="off"
      autoFocus={autoFocus}
      maxLength={maxLength}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      {...(invalid
        ? { "aria-invalid": true, "aria-describedby": describedBy }
        : {})}
      className={
        stepper
          ? cx(numberClasses, "w-[72px] border-x border-border")
          : cx(numberClasses, "w-24 px-3")
      }
    />
  );
  if (!stepper) {
    return (
      <div
        className={cx(
          "flex h-12 w-fit flex-none items-stretch overflow-hidden rounded-md border border-border bg-surface",
          className,
        )}
      >
        {number}
        {unit ? (
          <span
            className="flex items-center border-l border-border px-3 text-body text-ink-2"
            data-testid="amount-unit"
          >
            {unit}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className={cx(
        "flex h-12 w-fit flex-none items-stretch overflow-hidden rounded-md border border-border bg-surface",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Minska"
        disabled={!canStepDown}
        onClick={() => onStep(-1)}
        className={stepButton}
      >
        <MinusIcon size={22} />
      </button>
      {number}
      <button
        type="button"
        aria-label="Öka"
        disabled={!canStepUp}
        onClick={() => onStep(1)}
        className={stepButton}
      >
        <PlusIcon size={22} />
      </button>
    </div>
  );
}

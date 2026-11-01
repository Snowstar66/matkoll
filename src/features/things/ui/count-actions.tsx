"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { cx } from "@/components/cx";
import { Stepper } from "@/components/stepper";
import { fail, type Result } from "@/lib/errors";
import { changeThingCount } from "../actions/thing-count";
import {
  cancelText,
  confirmText,
  fewerRefillText,
  fewerText,
  maxCountStep,
  moreRefillText,
  moreText,
  refillText,
  stepperValueText,
  takeText,
  type Changed,
} from "../domain/thing-count";

// Ta och fyll på (Story 18.23): the two small buttons of a counted föremål, Ta
// and Fyll på, in the chip look. A tap swaps them for a small stepper − 1 +,
// a slim button that says what happens ("Ta 2") and Avbryt; no sheet, so the
// most common case is two taps (Ta → Ta 1). − stops at 1, and + at the count
// Livskoll thinks there is when taking (there is no top when filling up). The
// change is saved at once; the caller says so (a toast, or a line in the
// sheet) with Ångra. Keyboard: arrows up and down step, Enter confirms, Esc
// cancels.

export type CountChange = Changed & { kind: "take" | "refill"; amount: number };

/** The stepper, the confirm button and Avbryt, for Ta or Fyll på (or, with `confirmLabel`, for setting a count). */
export function CountStepRow({
  value,
  onValue,
  max,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  fewerLabel,
  moreLabel,
  onBg = false,
  className,
}: {
  value: number;
  onValue: (value: number) => void;
  max?: number;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  fewerLabel: string;
  moreLabel: string;
  onBg?: boolean;
  className?: string;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);
  const ceiling = max ?? Infinity;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      onValue(Math.min(ceiling, value + 1));
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      onValue(Math.max(1, value - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      onConfirm();
    } else if (event.key === "Escape") {
      // The sheet around a row in a sheet must not close.
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div role="group" aria-label={confirmLabel} className={cx("flex flex-nowrap items-center gap-2", className)} onKeyDown={onKeyDown} data-testid="count-step">
      <Stepper
        compact
        onBg={onBg}
        value={value}
        onChange={onValue}
        min={1}
        max={max}
        format={stepperValueText}
        decreaseLabel={fewerLabel}
        increaseLabel={moreLabel}
      />
      <Button ref={confirmRef} variant="compact-primary" className="shrink-0 whitespace-nowrap" aria-disabled={busy || undefined} onClick={onConfirm} data-testid="count-confirm">
        {confirmLabel}
      </Button>
      <Button variant="compact" className="shrink-0" disabled={busy} onClick={onCancel}>
        {cancelText}
      </Button>
    </div>
  );
}

/** The state of Ta / Fyll på for one föremål: which is open, the amount, and the save. */
export function useCountStep(itemId: string, onChanged: (change: CountChange) => void, onError: (message: string) => void) {
  const [mode, setMode] = useState<"take" | "refill" | null>(null);
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);

  function open(kind: "take" | "refill", button: HTMLButtonElement) {
    opener.current = button;
    setAmount(1);
    setMode(kind);
  }

  function close() {
    setMode(null);
    // Focus goes back to the chip that opened it.
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
    });
  }

  async function confirm() {
    if (!mode || busy) return;
    const kind = mode;
    const delta = kind === "take" ? -amount : amount;
    setBusy(true);
    let result: Result<Changed>;
    try {
      result = await changeThingCount({ itemId, delta });
    } catch {
      result = fail("things_count_failed");
    }
    setBusy(false);
    if (!result.ok) {
      onError(result.error.message);
      return;
    }
    setMode(null);
    onChanged({ ...result.data, kind, amount });
  }

  return { mode, amount, setAmount, busy, open, close, confirm };
}

export type CountStep = ReturnType<typeof useCountStep>;

/** The stepper row of an open Ta or Fyll på. */
export function OpenCountStep({ step, quantity, onBg = false, className }: { step: CountStep; quantity: number; onBg?: boolean; className?: string }) {
  if (!step.mode) return null;
  const take = step.mode === "take";
  return (
    <CountStepRow
      value={step.amount}
      onValue={step.setAmount}
      max={take ? Math.max(1, quantity) : maxCountStep}
      confirmLabel={confirmText(step.mode, step.amount)}
      busy={step.busy}
      onConfirm={step.confirm}
      onCancel={step.close}
      fewerLabel={take ? fewerText : fewerRefillText}
      moreLabel={take ? moreText : moreRefillText}
      onBg={onBg}
      className={className}
    />
  );
}

/** The chips Ta and Fyll på, or only Fyll på at 0 ("Slut"). */
export function CountChips({ step, quantity }: { step: CountStep; quantity: number }) {
  return (
    <>
      {quantity > 0 ? (
        <Chip action selected={false} onClick={(event) => step.open("take", event.currentTarget)} data-testid="count-take">
          {takeText}
        </Chip>
      ) : null}
      <Chip action selected={false} onClick={(event) => step.open("refill", event.currentTarget)} data-testid="count-refill">
        {refillText}
      </Chip>
    </>
  );
}

/** Ta and Fyll på in a row of their own (a hit row): the chips, or the open stepper in their place. */
export function CountActions({
  itemId,
  quantity,
  onChanged,
  onError,
  className,
}: {
  itemId: string;
  quantity: number;
  onChanged: (change: CountChange) => void;
  onError: (message: string) => void;
  className?: string;
}) {
  const step = useCountStep(itemId, onChanged, onError);
  return (
    <div className={className} data-testid="count-actions">
      {step.mode ? (
        <OpenCountStep step={step} quantity={quantity} onBg />
      ) : (
        <div className="flex min-h-tap items-center gap-2">
          <CountChips step={step} quantity={quantity} />
        </div>
      )}
    </div>
  );
}

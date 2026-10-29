"use client";

import { useId, useMemo, useState } from "react";
import { Button, type ButtonVariant } from "@/components/button";
import { cx } from "@/components/cx";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { formatQuantity } from "@/features/catalog";
import { roundSum, type PantrySnapshot } from "@/features/pantry";
import { scaleFactor } from "@/features/recipes";
import { errorMessages, type Result } from "@/lib/errors";
import { markDishCooked } from "../actions/mark-dish-cooked";
import { undoDishCooked } from "../actions/undo-dish-cooked";
import {
  checkHeading,
  cookedPlan,
  cookedText,
  deductionText,
  amountText,
  newAmountOf,
  shortNote,
  type CookedLine,
  type DeductLine,
  type MarkedCooked,
} from "../domain/cooked";

// Markera som lagad (Story 13.4, FR-13): a button on a dish, in Matsedel and
// at the end of the step mode, that opens a sheet with what the dish takes
// from the pantry. Each line is "Grädde  5 dl − 2 dl → 3 dl" with the new
// amount editable and a tick to skip it; what cannot be counted is listed
// under "Kontrollera själv" and never deducted. "Dra från lagret och markera
// lagad" does both in one server action; "Ångra" restores both.

export type MarkCookedButtonProps = {
  dish: { id: string; title: string; servings: number };
  /** The servings the recipe's amounts are written for. */
  originalServings: number;
  lines: readonly CookedLine[];
  /** The pantry of the selected place; `null` when it could not be read: nothing is deducted then. */
  snapshot: PantrySnapshot | null;
  /** The place `snapshot` is read from. */
  siteId: string | null;
  /** The catalog names by ingredient id. */
  names: Readonly<Record<string, string>>;
  variant?: ButtonVariant;
  className?: string;
  fullWidth?: boolean;
};

type Entry = { on: boolean; text: string };

/** The deduction a line gives with its entry, or `null` when it is skipped or its amount is not valid. */
function deductionOf(line: DeductLine, entry: Entry | undefined): number | null {
  if (!entry?.on) return null;
  const left = newAmountOf(line, entry.text);
  if (left === null) return null;
  const taken = roundSum(line.current - left);
  return taken > 0 ? taken : null;
}

export function MarkCookedButton({
  dish,
  originalServings,
  lines,
  snapshot,
  siteId,
  names,
  variant = "secondary",
  className,
  fullWidth,
}: MarkCookedButtonProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marked, setMarked] = useState(false);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const headingId = useId();

  const factor = scaleFactor(dish.servings, originalServings);
  const plan = useMemo(
    () => (snapshot ? cookedPlan(lines, factor, snapshot, names) : { deduct: [], check: [] }),
    [lines, factor, snapshot, names],
  );

  function openSheet() {
    setEntries(
      Object.fromEntries(
        plan.deduct.map((line) => [line.key, { on: true, text: amountText(line.suggested) }]),
      ),
    );
    setError(null);
    setOpen(true);
  }

  const deductions = plan.deduct.flatMap((line) => {
    const taken = deductionOf(line, entries[line.key]);
    return taken === null ? [] : [{ line, taken }];
  });
  const invalid = plan.deduct.some(
    (line) => entries[line.key]?.on && newAmountOf(line, entries[line.key]?.text ?? "") === null,
  );

  async function confirm() {
    if (busy || invalid) return;
    setBusy(true);
    setError(null);
    let result: Result<MarkedCooked>;
    try {
      result = await markDishCooked({
        dishId: dish.id,
        siteId,
        deductions: deductions.map(({ line, taken }) => ({ ingredientId: line.ingredientId, unit: line.unit, amount: taken })),
      });
    } catch {
      setBusy(false);
      setError(errorMessages.mealplan_cooked_failed);
      return;
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const { rows } = result.data;
    setOpen(false);
    setMarked(true);
    showToast(cookedText(dish.title, rows.length), {
      onUndo: () => {
        void (async () => {
          let undone: Result<null>;
          try {
            undone = await undoDishCooked({ dishId: dish.id });
          } catch {
            showToast(errorMessages.mealplan_cooked_undo_failed, { role: "alert" });
            return;
          }
          if (undone.ok) setMarked(false);
          else showToast(undone.error.message, { role: "alert" });
        })();
      },
    });
  }

  if (marked) {
    return (
      <p data-testid="cooked-here" className={cx("flex min-h-tap items-center text-row-title text-ink-2", className)}>
        Lagad
      </p>
    );
  }

  return (
    <>
      <Button variant={variant} fullWidth={fullWidth} onClick={openSheet} className={className}>
        Markera som lagad
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Markera som lagad"
        subtitle={`${dish.title}, ${dish.servings} ${dish.servings === 1 ? "portion" : "portioner"}`}
        closeLabel="Avbryt"
        preventClose={busy}
        footer={
          <Button fullWidth onClick={() => void confirm()} disabled={busy || invalid}>
            {deductions.length > 0 ? "Dra från lagret och markera lagad" : "Markera som lagad"}
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {error ? <Notice role="alert">{error}</Notice> : null}
          {snapshot === null ? <Notice>Lagret gick inte att läsa, så inget dras.</Notice> : null}
          {plan.deduct.length > 0 ? (
            <ul aria-label="Dras från lagret" className="flex flex-col gap-3">
              {plan.deduct.map((line) => {
                const entry = entries[line.key] ?? { on: true, text: "" };
                const left = newAmountOf(line, entry.text);
                const taken = deductionOf(line, entry);
                return (
                  <li key={line.key} data-testid="cooked-line" className="flex flex-col gap-1 rounded-lg bg-surface p-3">
                    <label className="flex min-h-tap items-center gap-3 text-row-title text-ink">
                      <input
                        type="checkbox"
                        checked={entry.on}
                        onChange={(event) =>
                          setEntries((all) => ({ ...all, [line.key]: { ...entry, on: event.target.checked } }))
                        }
                        className="size-6 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span className="min-w-0 break-words">{line.name}</span>
                    </label>
                    <p className="text-meta text-ink-2" data-testid="cooked-line-text">
                      {entry.on && left !== null
                        ? deductionText(line, taken ?? 0, left)
                        : `${formatQuantity(line.current, line.unit)} hemma${entry.on ? "" : ", dras inte"}`}
                    </p>
                    {entry.on ? (
                      <label className="flex min-h-tap items-center gap-2 text-meta text-ink-2">
                        Ny mängd
                        <input
                          inputMode="decimal"
                          value={entry.text}
                          aria-label={`Ny mängd ${line.name}`}
                          aria-invalid={left === null || undefined}
                          onChange={(event) =>
                            setEntries((all) => ({ ...all, [line.key]: { ...entry, text: event.target.value } }))
                          }
                          className="h-11 w-24 rounded-md bg-bg px-3 text-body text-ink"
                        />
                        {line.unit}
                      </label>
                    ) : null}
                    {entry.on && line.short && entry.text === amountText(line.suggested) ? (
                      <p className="text-meta text-ink-2">{shortNote(line)}</p>
                    ) : null}
                    {entry.on && left === null ? (
                      <p role="alert" className="text-meta text-danger">
                        Skriv en mängd från 0 till {formatQuantity(line.current, line.unit)}.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : snapshot !== null ? (
            <p className="text-body text-ink-2">Inget går att dra av automatiskt från lagret.</p>
          ) : null}
          {plan.check.length > 0 ? (
            <section aria-labelledby={headingId} className="flex flex-col gap-2">
              <h3 id={headingId} className="text-section-label text-ink-2">
                {checkHeading}
              </h3>
              <ul className="flex flex-col gap-2">
                {plan.check.map((line) => (
                  <li key={line.key} data-testid="cooked-check" className="rounded-lg bg-surface px-3 py-2">
                    <p className="text-row-title break-words text-ink">{line.text}</p>
                    <p className="text-meta text-ink-2">{line.reason} Dras inte.</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}

"use client";

import { cx } from "@/components/cx";
import { CheckIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { Stepper } from "@/components/stepper";
import { maxServings, weekdayNames, weekdays } from "../domain/meal-plan";
import { weekdayDateText } from "../domain/week";

// Flytta till dag (Story 13.5, FR-13): a small sheet with the days still open
// and "Ingen dag", opened from a dish's day chip on Matsedel (Story 25.3). It
// is named by the dish (UX-33), and each day says its date and what already
// lies there ("Lördag 7/11 · Röd linssoppa"). A tap moves the dish and closes
// the sheet; the dish's own day is ticked.

export type MoveToDaySheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The dish's day now, or `null`. */
  weekday: number | null;
  /** UX-33: the Monday of the week shown, for the dates of the days. */
  weekStart: string;
  /** The first weekday (1–7) still open; earlier days of this week are left out (the dish's own day always shows). */
  firstOpenDay?: number;
  /** The other dishes' titles by weekday, shown after the date of a day that already has one. */
  taken?: Readonly<Record<number, readonly string[]>>;
  /** Called with the chosen day (1–7) or `null`; the sheet closes at once. */
  onMove: (weekday: number | null) => void;
  /**
   * Story 25.3: the dish's portions, which Matsedel no longer has a ⋯ sheet
   * for: a stepper on top of the days, and "Klar" closes the sheet.
   */
  servings?: { value: number; onChange: (value: number) => void };
};

export function MoveToDaySheet({ open, onClose, title, weekday, weekStart, firstOpenDay = 1, taken = {}, onMove, servings }: MoveToDaySheetProps) {
  const choices: { value: number | null; label: string }[] = [
    ...weekdays
      .filter((day) => day >= firstOpenDay || day === weekday)
      .map((day) => {
        const date = weekdayDateText(weekStart, day);
        const others = taken[day] ?? [];
        const name = `${weekdayNames[day - 1] as string}${date ? ` ${date}` : ""}`;
        return { value: day as number | null, label: others.length > 0 ? `${name} · ${others.join(", ")}` : name };
      }),
    { value: null, label: "Ingen dag" },
  ];
  return (
    <Sheet open={open} onClose={onClose} title={title} closeLabel={servings ? "Klar" : "Avbryt"}>
      {servings ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-bg py-1 pr-1 pl-3.5">
          <span className="text-body text-ink">Portioner</span>
          <Stepper
            value={servings.value}
            onChange={servings.onChange}
            min={1}
            max={maxServings}
            decreaseLabel={`Färre portioner, ${title}`}
            increaseLabel={`Fler portioner, ${title}`}
          />
        </div>
      ) : null}
      <ul aria-label="Dagar" className="flex flex-col">
        {choices.map(({ value, label }) => {
          const current = value === weekday || (value === null && !weekday);
          return (
            <li key={label} className="border-t border-hairline first:border-t-0">
              <button
                type="button"
                data-testid="day-choice"
                aria-pressed={current}
                onClick={() => {
                  onClose();
                  if (!current) onMove(value);
                }}
                className={cx(
                  "flex min-h-tap w-full items-center justify-between gap-3 rounded-md py-2 text-left text-row-title",
                  current ? "text-accent" : "text-ink",
                )}
              >
                <span className="min-w-0 wrap-break-word">{label}</span>
                {current ? <CheckIcon size={20} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

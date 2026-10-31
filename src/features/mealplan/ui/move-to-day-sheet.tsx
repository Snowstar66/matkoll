"use client";

import { cx } from "@/components/cx";
import { CheckIcon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { weekdayNames, weekdays } from "../domain/meal-plan";

// Flytta till dag (Story 13.5, FR-13): a small sheet with the seven days and
// "Ingen dag", opened from the dish's ⋯ sheet (Story 3.11). A tap moves the
// dish and closes the sheet; the dish's own day is ticked.

export type MoveToDaySheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The dish's day now, or `null`. */
  weekday: number | null;
  /** Called with the chosen day (1–7) or `null`; the sheet closes at once. */
  onMove: (weekday: number | null) => void;
};

export function MoveToDaySheet({ open, onClose, title, weekday, onMove }: MoveToDaySheetProps) {
  const choices: { value: number | null; label: string }[] = [
    ...weekdays.map((day) => ({ value: day as number | null, label: weekdayNames[day - 1] as string })),
    { value: null, label: "Ingen dag" },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Flytta till dag" subtitle={title} closeLabel="Avbryt">
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
                {label}
                {current ? <CheckIcon size={20} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

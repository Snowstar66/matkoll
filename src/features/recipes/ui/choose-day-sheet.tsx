"use client";

import { cx } from "@/components/cx";
import { Sheet } from "@/components/sheet";
import { weekdayNames, weekdays } from "@/features/mealplan";

// "Vilken dag?" (Story 25.1): the optional day for a recipe that already lies on
// this week's meal plan. Mån–Sön and "Ingen dag"; a tap picks and closes.

export type ChooseDaySheetProps = {
  open: boolean;
  onClose: () => void;
  /** The week the dish is on: "Vecka 46, nästa vecka"; said in the subtitle. */
  weekLabel?: string;
  /** The dish's day now, 1–7, or `null`. */
  weekday: number | null;
  /** Called with the chosen day (1–7) or `null` for "Ingen dag"; the sheet closes at once. */
  onChoose: (weekday: number | null) => void;
};

export function ChooseDaySheet({ open, onClose, weekday, weekLabel, onChoose }: ChooseDaySheetProps) {
  const choices: { value: number | null; label: string; sub: string }[] = [
    ...weekdays.map((day) => ({ value: day as number | null, label: (weekdayNames[day - 1] as string).slice(0, 3), sub: "" })),
    { value: null, label: "Ingen", sub: "dag" },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Vilken dag?" subtitle={weekLabel ? `${weekLabel}. Frivilligt, rätten ligger på veckan ändå.` : "Frivilligt. Rätten ligger på veckan ändå."} closeLabel="Avbryt">
      <ul aria-label="Dagar" className="grid grid-cols-4 gap-2">
        {choices.map(({ value, label, sub }) => {
          const current = value === weekday;
          return (
            <li key={label} className="flex">
              <button
                type="button"
                data-testid="day-choice"
                aria-pressed={current}
                aria-label={value === null ? "Ingen dag" : (weekdayNames[value - 1] as string)}
                onClick={() => {
                  onClose();
                  if (!current) onChoose(value);
                }}
                className={cx(
                  "flex min-h-tap w-full cursor-pointer flex-col items-center justify-center rounded-md border px-1 py-2 text-control",
                  current ? "border-accent bg-accent text-on-accent" : "border-border bg-surface text-ink",
                )}
              >
                <span aria-hidden="true">{label}</span>
                {sub ? (
                  <span aria-hidden="true" className="text-meta">
                    {sub}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

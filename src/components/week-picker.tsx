import { cx } from "@/components/cx";

/** A week the picker offers: the Monday, how far from this week (0, 1, 2) and the ISO week number. */
export type PickerWeek = { weekStart: string; offset: number; number: number };

const weekOptionLabels = ["Denna vecka", "Nästa vecka", "Om 2 veckor"];

/**
 * Which week a dish goes on: Denna vecka / Nästa vecka / Om 2 veckor, the same
 * three as Matsedel's week tiles, with the line "Matsedel för vecka 46" under.
 * Shared by the recipe page and "Rätter med extrapris"; `testId` is the prefix of
 * the test ids (`<testId>`, `<testId>-option`, `<testId>-line`).
 */
export function WeekPicker({
  weeks,
  selected,
  onSelect,
  testId,
}: {
  weeks: readonly PickerWeek[];
  selected: number;
  onSelect: (offset: number) => void;
  testId: string;
}) {
  const current = weeks.find((week) => week.offset === selected);
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      {/* With large text the three wrap onto more rows instead of pushing the page sideways. */}
      <div role="group" aria-label="Vecka på matsedeln" className="flex flex-wrap gap-1.5">
        {weeks.map((week) => {
          const on = week.offset === selected;
          return (
            <button
              key={week.weekStart}
              type="button"
              data-testid={`${testId}-option`}
              aria-pressed={on}
              onClick={() => onSelect(week.offset)}
              className={cx(
                "flex min-h-tap flex-1 cursor-pointer items-center justify-center rounded-md border px-2 text-control whitespace-nowrap",
                on ? "border-accent bg-accent text-on-accent" : "border-border bg-surface text-ink",
              )}
            >
              {weekOptionLabels[week.offset] ?? `Om ${week.offset} veckor`}
            </button>
          );
        })}
      </div>
      {current ? (
        <p className="text-meta text-ink-2" data-testid={`${testId}-line`}>
          Matsedel för vecka {current.number}
        </p>
      ) : null}
    </div>
  );
}

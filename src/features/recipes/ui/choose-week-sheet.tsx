"use client";

import { ChoiceRows } from "@/components/choice-rows";
import { Sheet } from "@/components/sheet";

/** One week in the sheet: its Monday, its name ("Nästa vecka") and what it holds ("v. 46 · Tom"). */
export type ChooseWeekOption = { weekStart: string; label: string; detail: string };

export type ChooseWeekSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The recipe's name, under the title. */
  recipeTitle: string;
  options: readonly ChooseWeekOption[];
  /** The week the dish lies on now; its row has the check. */
  current: string | null;
  /** Called with the chosen week; the sheet closes at once. */
  onChoose: (weekStart: string) => void;
};

/**
 * "Vilken vecka?" (UX-05): moves a dish that "Lägg på matsedeln" put on the
 * remembered week to another one. This week, next week and the week after (and
 * the remembered week when it is further ahead), each with its week number and
 * how many dishes it has. A tap picks and closes; the day is chosen later on Matsedel.
 */
export function ChooseWeekSheet({ open, onClose, recipeTitle, options, current, onChoose }: ChooseWeekSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Vilken vecka?" subtitle={recipeTitle} closeLabel="Avbryt">
      <div className="flex flex-col gap-3">
        <ChoiceRows
          label="Vilken vecka?"
          value={current}
          onChange={() => {}}
          onPick={(weekStart) => {
            onClose();
            if (weekStart !== current) onChoose(weekStart);
          }}
          options={options.map((option) => ({ value: option.weekStart, label: option.label, detail: option.detail, testId: "week-choice" }))}
        />
        <p className="text-meta text-ink-2">Dag väljer du på Matsedel, om du vill.</p>
      </div>
    </Sheet>
  );
}

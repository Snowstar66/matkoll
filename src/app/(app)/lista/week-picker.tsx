"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { cx } from "@/components/cx";
import { currentWeekStart, weekChoices, weekParam, weekQuery } from "@/features/mealplan";

/**
 * Which week Inköpslista counts (Story 13.7): "Vecka 44 · Denna vecka ▾", then
 * "Nästa vecka" and the weeks after. The week is in the address
 * (`?vecka=2026-W45`), so a reload keeps it; this week is the plain address.
 * A native select: 44 px tall, wraps at large text, and works with the
 * keyboard and screen readers without more code.
 */
export function WeekPicker({ weekStart }: { weekStart: string }) {
  const router = useRouter();
  const id = useId();
  // The choices are counted in the browser's moment; the page's week is the server's, so keep it in the list.
  const choices = weekChoices();
  const thisWeek = currentWeekStart();
  const options = choices.some((choice) => choice.weekStart === weekStart)
    ? choices
    : [{ weekStart, offset: 0, name: `Vecka ${weekParam(weekStart).slice(-2)}`, label: "" }, ...choices];
  return (
    <div className="flex items-center gap-2" data-testid="week-picker">
      <label htmlFor={id} className="text-meta text-ink-2">
        Vecka
      </label>
      <select
        id={id}
        value={weekStart}
        onChange={(event) => {
          const week = event.target.value;
          router.push(`/lista${weekQuery(week, new Date(`${thisWeek}T12:00:00Z`))}`, { scroll: false });
        }}
        className={cx(
          "min-h-tap min-w-0 flex-1 rounded-md border border-ink-3 bg-surface px-3 text-body text-ink",
        )}
      >
        {options.map((choice) => (
          <option key={choice.weekStart} value={choice.weekStart}>
            {choice.label ? `${choice.name} · ${choice.label}` : choice.name}
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { RememberWeek } from "./remember-week";

/** One week the dropdown offers: the label ("Nästa vecka") and the address that shows it. */
export type WeekOption = { week: string; label: string; href: string };

/**
 * Inköpslistans vecka som en diskret rullgardin, i samma stil som boende-knappen ("Denna vecka ⌄"): en vanlig
 * <select>, så den fungerar med tangentbord och skärmläsare, och ett val går till veckans adress (`?vecka=`).
 * Veckan kommer ihåg på enheten som förut (RememberWeek).
 */
export function WeekSelect({ weekStart, options }: { weekStart: string; options: readonly WeekOption[] }) {
  const router = useRouter();
  const id = useId();
  return (
    <div className="relative ml-auto shrink-0">
      <RememberWeek weekStart={weekStart} />
      <label htmlFor={id} className="sr-only">
        Vecka
      </label>
      <select
        id={id}
        data-testid="week-select"
        value={weekStart}
        onChange={(event) => {
          const chosen = options.find((option) => option.week === event.target.value);
          if (chosen) router.push(chosen.href, { scroll: false });
        }}
        className="min-h-tap cursor-pointer appearance-none rounded-md bg-transparent py-1 pr-6 pl-2 text-meta text-ink-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {options.map((option) => (
          <option key={option.week} value={option.week}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={14} className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-ink-2" />
    </div>
  );
}

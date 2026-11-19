"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { readOption } from "@/lib/options";
import { useOption } from "@/lib/use-option";
import { RememberWeek } from "./remember-week";

/** One week the dropdown offers: the label ("Nästa vecka") and the address that shows it. */
export type WeekOption = { week: string; label: string; href: string };

/** Matsedel's look back (Tillval "Visa tidigare vecka"): last week, the way to this week, and the list of older plans. */
export type WeekHistory = { lastWeek: WeekOption; thisWeekHref: string; olderHref: string };

const olderValue = "__older";

/**
 * Veckan som en diskret rullgardin, i samma stil som boende-knappen ("Denna vecka ⌄"): en vanlig <select>, så den
 * fungerar med tangentbord och skärmläsare, och ett val går till veckans adress (`?vecka=`).
 * Veckan kommer ihåg på enheten som förut (RememberWeek).
 * Matsedel ger `history`: med Tillval "Visa tidigare vecka" på (per enhet, så den läggs till här i webbläsaren och
 * inte av servern) kommer "Förra veckan" först och "Äldre veckor ›", listan med äldre matsedlar, sist. Förra veckan
 * bara tittas på och kommer aldrig ihåg; med Tillvalet av skickas du till denna vecka.
 */
export function WeekSelect({ weekStart, options, history }: { weekStart: string; options: readonly WeekOption[]; history?: WeekHistory }) {
  const router = useRouter();
  const id = useId();
  const showPrevious = useOption("showPreviousWeek");
  const viewingLast = !!history && weekStart === history.lastWeek.week;
  const olderHref = history?.olderHref;
  const thisWeekHref = history?.thisWeekHref;
  // Switched off while last week is shown (or opened by its address with it off): back to this week. The first render
  // has no stored value yet (the server's), so the stored one is read for real before anyone is sent away.
  useEffect(() => {
    if (viewingLast && !showPrevious && thisWeekHref && !readOption("showPreviousWeek")) router.replace(thisWeekHref, { scroll: false });
  }, [viewingLast, showPrevious, thisWeekHref, router]);
  const shown = history && (showPrevious || viewingLast) ? [history.lastWeek, ...options] : options;
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
          if (event.target.value === olderValue && olderHref) {
            router.push(olderHref);
            return;
          }
          const chosen = shown.find((option) => option.week === event.target.value);
          if (chosen) router.push(chosen.href, { scroll: false });
        }}
        className="min-h-tap cursor-pointer appearance-none rounded-md bg-transparent py-1 pr-6 pl-2 text-meta text-ink-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {shown.map((option) => (
          <option key={option.week} value={option.week}>
            {option.label}
          </option>
        ))}
        {history && showPrevious ? <option value={olderValue}>Äldre veckor {"›"}</option> : null}
      </select>
      <ChevronDownIcon size={14} className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-ink-2" />
    </div>
  );
}

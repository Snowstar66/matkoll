"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CloseIcon, LeafIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";
import { almanacLine } from "../domain/almanac";
import { dayKey, shortDateText, stockholmDay } from "../domain/dates";
import { hiddenChangedEvent, hideToday, isHiddenToday } from "../domain/hide";
import type { SeasonRecipe } from "../domain/season";
import { todayLines } from "../domain/today-lines";

// Dagens: a calm card on top of Recept (UX mockup efter-dagens-a/b/c). One food line,
// and the name day and the Chinese almanac when they are switched on in Tillval. The date
// is read in the browser (Swedish day), so the card appears after the first render and
// nothing time-dependent is prerendered. The X hides it until tomorrow, on this device.

function subscribe(listener: () => void) {
  // A tab left open overnight: look at the date again when it comes back and once a minute.
  const timer = window.setInterval(listener, 60_000);
  window.addEventListener("storage", listener);
  window.addEventListener(hiddenChangedEvent, listener);
  document.addEventListener("visibilitychange", listener);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("storage", listener);
    window.removeEventListener(hiddenChangedEvent, listener);
    document.removeEventListener("visibilitychange", listener);
  };
}

/** Today's key in Stockholm, or null on the server and during the first render. */
function useTodayKey(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => dayKey(stockholmDay(new Date())),
    () => null,
  );
}

function useHidden(key: string | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (key !== null && isHiddenToday(key)),
    () => true,
  );
}

export function TodayCard({ recipes }: { recipes: readonly SeasonRecipe[] }) {
  const show = useOption("dagensShow");
  const food = useOption("dagensFood");
  const nameDay = useOption("dagensNameDay");
  const almanac = useOption("dagensAlmanac");
  const key = useTodayKey();
  const hidden = useHidden(key);
  const day = useMemo(() => (key === null ? null : stockholmDay(new Date())), [key]);
  // The almanac library is loaded only when its switch is on; the line is for one day.
  const [almanacText, setAlmanacText] = useState<{ key: string; line: string | null } | null>(null);
  useEffect(() => {
    if (!almanac || day === null || key === null) return;
    let live = true;
    void almanacLine(day).then((line) => {
      if (live) setAlmanacText({ key, line });
    });
    return () => {
      live = false;
    };
  }, [almanac, day, key]);
  const almanacToday = almanac && almanacText?.key === key ? almanacText.line : null;
  const lines = useMemo(
    () => (day ? todayLines(day, { food, nameDay, almanac }, recipes, almanacToday) : []),
    [day, food, nameDay, almanac, recipes, almanacToday],
  );

  if (!show || hidden || key === null || day === null || lines.length === 0) return null;
  return (
    <section aria-label="Dagens" className="mb-3 flex items-start gap-3 rounded-lg bg-surface p-4" data-testid="dagens-card">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-mint text-mint-ink">
        <LeafIcon size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-section-label text-ink-3 uppercase">Dagens · {shortDateText(day)}</p>
        {lines.map((line, index) => (
          <p key={index} className={index === 0 ? "text-body break-words text-ink" : "text-meta break-words text-ink-2"}>
            {line.map((part, partIndex) =>
              part.recipeId ? (
                <Link key={partIndex} href={`/recept/${part.recipeId}`} className="underline decoration-ink-3 underline-offset-2">
                  {part.text}
                </Link>
              ) : (
                <span key={partIndex}>{part.text}</span>
              ),
            )}
          </p>
        ))}
      </div>
      <button
        type="button"
        aria-label="Dölj idag"
        onClick={() => hideToday(key)}
        className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3"
      >
        <CloseIcon size={18} />
      </button>
    </section>
  );
}

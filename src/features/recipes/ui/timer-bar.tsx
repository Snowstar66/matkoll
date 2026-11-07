"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/cx";
import { CloseIcon } from "@/components/icons";
import { formatCountdown } from "../domain/step-timer";
import type { StepTimer } from "./use-step-timers";

/** The time now, ticking while `active`; it is read again when the page shows, as timers stand still in a locked phone. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active]);
  return now;
}

export type TimerBarProps = {
  timers: readonly StepTimer[];
  /** A timer has run out; called once per timer by the hook. */
  onFinish: (id: string) => void;
  onDismiss: (id: string) => void;
};

/**
 * The running timers of a recipe, one compact row each, pinned under the top of
 * the page: the step, the time left (counted from the end time, not from ticks)
 * and a stop button. A timer that has run out says "Klar" and stays until it is
 * dismissed.
 */
export function TimerBar({ timers, onFinish, onDismiss }: TimerBarProps) {
  const running = timers.some((timer) => !timer.done);
  const now = useNow(running);

  useEffect(() => {
    for (const timer of timers) if (!timer.done && timer.endsAt <= now) onFinish(timer.id);
  }, [timers, now, onFinish]);

  if (timers.length === 0) return null;
  return (
    <ul
      aria-label="Timers"
      data-testid="timer-bar"
      className="sticky top-[max(8px,env(safe-area-inset-top))] z-20 flex flex-col gap-1 rounded-lg border border-border bg-surface p-1 shadow-sm"
    >
      {timers.map((timer) => {
        const finished = timer.done || timer.endsAt <= now;
        return (
          <li
            key={timer.id}
            data-testid="timer-row"
            className={cx(
              "flex min-h-tap items-center gap-3 rounded-md pl-3 text-body",
              finished ? "bg-mint text-mint-ink" : "text-ink",
            )}
          >
            <span className="min-w-0 grow truncate">{timer.label}</span>
            {finished ? (
              <span role="status" className="font-semibold">
                Klar
              </span>
            ) : (
              <span className="font-semibold tabular-nums" data-testid="timer-time">
                {formatCountdown(timer.endsAt - now)}
              </span>
            )}
            <button
              type="button"
              onClick={() => onDismiss(timer.id)}
              aria-label={finished ? `Stäng timer ${timer.label}` : `Stoppa timer ${timer.label}`}
              className="flex size-tap shrink-0 items-center justify-center rounded-md text-ink-2"
            >
              <CloseIcon size={18} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

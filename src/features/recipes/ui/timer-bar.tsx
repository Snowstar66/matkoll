"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/cx";
import { BellIcon, CheckIcon, CloseIcon } from "@/components/icons";
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
  /** More minutes on a timer (a finished one starts again). */
  onExtend: (id: string, minutes: number) => void;
};

/** The minutes a finished timer can be given. */
const moreMinutes = [1, 5] as const;

/** "Bakpotatis, Steg 7": how a button names its timer. */
const timerName = (timer: StepTimer) => (timer.cue ? `${timer.cue}, ${timer.label}` : timer.label);

/**
 * The running timers of a recipe, one row each, pinned under the top of the
 * page: what the timer is for ("Bakpotatis") over its step ("Steg 7"), the time
 * left (counted from the end time, not from ticks) with a thin line for the
 * time gone, and a stop button. A timer that has run out turns mint, says
 * "Klar" and offers +1 min, +5 min and a check that answers it.
 */
export function TimerBar({ timers, onFinish, onDismiss, onExtend }: TimerBarProps) {
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
        // Never more than it was set to: `now` can be a tick older than the tap that started it.
        const left = Math.min(timer.endsAt - now, timer.totalMs ?? Number.POSITIVE_INFINITY);
        const gone = timer.totalMs ? Math.min(1, Math.max(0, 1 - left / timer.totalMs)) : null;
        return (
          <li
            key={timer.id}
            data-testid="timer-row"
            className={cx(
              "relative flex min-h-14 items-center overflow-hidden rounded-md py-1.5 pl-3",
              finished ? "gap-1" : "gap-2",
              finished ? "bg-mint text-mint-ink" : "text-ink",
            )}
          >
            {finished ? <BellIcon size={18} className="mr-1 shrink-0 motion-safe:animate-pulse" /> : null}
            <span className="flex min-w-0 grow flex-col">
              <span className="truncate text-row-title" data-testid="timer-cue">
                {timer.cue ?? timer.label}
              </span>
              <span className={cx("truncate text-meta", finished ? "text-mint-ink" : "text-ink-2")}>
                {timer.cue ? timer.label : null}
                {finished ? (
                  <span role="status">
                    {timer.cue ? " · " : null}
                    Klar
                  </span>
                ) : null}
              </span>
            </span>
            {finished ? (
              <>
                {moreMinutes.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => onExtend(timer.id, minutes)}
                    aria-label={`${minutes} minut${minutes === 1 ? "" : "er"} till på ${timerName(timer)}`}
                    className="flex h-tap shrink-0 items-center px-0.5 text-meta font-semibold"
                  >
                    <span className="rounded-full border border-current px-2 py-1">+{minutes} min</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onDismiss(timer.id)}
                  aria-label={`Kvittera timer ${timerName(timer)}`}
                  className="mr-1 flex size-tap shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
                >
                  <CheckIcon size={20} />
                </button>
              </>
            ) : (
              <>
                <span className="text-headline tabular-nums" data-testid="timer-time">
                  {formatCountdown(left)}
                </span>
                <button
                  type="button"
                  onClick={() => onDismiss(timer.id)}
                  aria-label={`Stoppa timer ${timerName(timer)}`}
                  className="flex size-tap shrink-0 items-center justify-center rounded-md text-ink-2"
                >
                  <CloseIcon size={18} />
                </button>
              </>
            )}
            {!finished && gone !== null ? (
              <span aria-hidden="true" className="absolute inset-x-3 bottom-1 h-[3px] rounded-full bg-fill">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${gone * 100}%` }} />
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

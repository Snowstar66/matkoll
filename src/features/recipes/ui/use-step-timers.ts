"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A timer started from a time in a step. It runs to `endsAt` (a clock time), so a backgrounded page still shows the right time. */
export type StepTimer = {
  id: string;
  /** "Steg 2" or the step's title. */
  label: string;
  /** What it is for, from the step ("Bakpotatis"), or null. Missing in timers stored before it existed. */
  cue?: string | null;
  /** The time it ends, `Date.now()` milliseconds. */
  endsAt: number;
  /** How long it runs in all, milliseconds, for the progress line (grows with +1 min). Missing in older timers. */
  totalMs?: number;
  /** The timer has run out and said so; the row stays until it is dismissed. */
  done: boolean;
  /** Done in an earlier view (read back from storage): it rang then and does not ring again. */
  silent?: boolean;
};

export type StartTimer = (input: { key: string; label: string; cue?: string | null; seconds: number }) => void;

/** How long the alarm keeps ringing when nobody answers it. */
export const alarmMs = 2 * 60 * 1000;
const alarmEveryMs = 2500;

const storageKey = (recipeId: string) => `livskoll:step-timers:${recipeId}`;

function isTimer(value: unknown): value is StepTimer {
  if (typeof value !== "object" || value === null) return false;
  const timer = value as Record<string, unknown>;
  return (
    typeof timer.id === "string" &&
    typeof timer.label === "string" &&
    typeof timer.endsAt === "number" &&
    typeof timer.done === "boolean" &&
    (timer.cue === undefined || timer.cue === null || typeof timer.cue === "string") &&
    (timer.totalMs === undefined || typeof timer.totalMs === "number")
  );
}

function readTimers(recipeId: string): StepTimer[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(storageKey(recipeId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isTimer) : [];
  } catch {
    return [];
  }
}

function writeTimers(recipeId: string, timers: StepTimer[]) {
  try {
    if (timers.length === 0) sessionStorage.removeItem(storageKey(recipeId));
    else sessionStorage.setItem(storageKey(recipeId), JSON.stringify(timers));
  } catch {
    // Private mode or full storage: the timers just live in this view.
  }
}

/** A short kitchen-timer ring with Web Audio, no sound file: three high-low pairs. The context is made on a tap, which lets it play later. */
function beep(context: AudioContext) {
  try {
    void context.resume?.();
    const start = context.currentTime;
    for (let index = 0; index < 6; index++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = index % 2 === 0 ? 1320 : 990;
      const at = start + index * 0.18 + Math.floor(index / 2) * 0.12;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.7, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.17);
    }
  } catch {
    // No sound where Web Audio is missing or blocked.
  }
}

function buzz() {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    // No vibration here.
  }
}

/**
 * The timers of one recipe view: started by tapping a time in a step, kept in
 * sessionStorage by recipe so a reload keeps them, and gone when the tab closes.
 * A timer that runs out rings (and vibrates) every few seconds until it is
 * dismissed or given more time, for two minutes at most.
 */
export function useStepTimers(recipeId: string) {
  const [timers, setTimers] = useState<StepTimer[]>([]);
  const loaded = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const alerted = useRef(new Set<string>());

  // Read after mount, so the server's and the browser's first render are the same.
  useEffect(() => {
    const stored = readTimers(recipeId);
    for (const timer of stored) if (timer.done) alerted.current.add(timer.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage can only be read in the browser
    setTimers(stored.map((timer) => (timer.done ? { ...timer, silent: true } : timer)));
    loaded.current = true;
  }, [recipeId]);

  useEffect(() => {
    if (loaded.current) writeTimers(recipeId, timers);
  }, [recipeId, timers]);

  // The alarm: rings while a timer is done here, until alarmMs after ringing began.
  const ringingSince = useRef<number | null>(null);
  const ringing = timers.some((timer) => timer.done && !timer.silent);
  useEffect(() => {
    if (!ringing) {
      ringingSince.current = null;
      return;
    }
    ringingSince.current ??= Date.now();
    const interval = setInterval(() => {
      if (ringingSince.current !== null && Date.now() - ringingSince.current > alarmMs) {
        clearInterval(interval);
        return;
      }
      buzz();
      if (audio.current) beep(audio.current);
    }, alarmEveryMs);
    return () => clearInterval(interval);
  }, [ringing]);

  const start = useCallback<StartTimer>(({ key, label, cue = null, seconds }) => {
    if (!audio.current && typeof AudioContext !== "undefined") {
      try {
        audio.current = new AudioContext();
      } catch {
        audio.current = null;
      }
    }
    alerted.current.delete(key);
    const endsAt = Date.now() + seconds * 1000;
    // The same time in the same step starts again instead of a second row.
    setTimers((current) => [...current.filter((timer) => timer.id !== key), { id: key, label, cue, endsAt, totalMs: seconds * 1000, done: false }]);
  }, []);

  const finish = useCallback((id: string) => {
    // Once per timer, however often the bar notices it has run out.
    if (alerted.current.has(id)) return;
    alerted.current.add(id);
    setTimers((current) => current.map((timer) => (timer.id === id ? { ...timer, done: true } : timer)));
    buzz();
    if (audio.current) beep(audio.current);
  }, []);

  const dismiss = useCallback((id: string) => {
    setTimers((current) => current.filter((timer) => timer.id !== id));
  }, []);

  /** More time: a running timer ends later, a finished one starts again from now and stops ringing. */
  const extend = useCallback((id: string, minutes: number) => {
    const ms = minutes * 60 * 1000;
    alerted.current.delete(id);
    setTimers((current) =>
      current.map((timer) => {
        if (timer.id !== id) return timer;
        const now = Date.now();
        const endsAt = Math.max(now, timer.endsAt) + ms;
        // A finished timer's line starts over with the added time.
        const totalMs = timer.done || timer.endsAt <= now ? ms : (timer.totalMs ?? timer.endsAt - now) + ms;
        return { ...timer, endsAt, totalMs, done: false, silent: false };
      }),
    );
  }, []);

  return { timers, start, finish, dismiss, extend };
}

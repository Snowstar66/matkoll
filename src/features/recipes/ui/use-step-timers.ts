"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A timer started from a time in a step. It runs to `endsAt` (a clock time), so a backgrounded page still shows the right time. */
export type StepTimer = {
  id: string;
  /** "Steg 2" or the step's title. */
  label: string;
  /** The time it ends, `Date.now()` milliseconds. */
  endsAt: number;
  /** The timer has run out and said so; the row stays until it is dismissed. */
  done: boolean;
};

export type StartTimer = (input: { key: string; label: string; seconds: number }) => void;

const storageKey = (recipeId: string) => `livskoll:step-timers:${recipeId}`;

function isTimer(value: unknown): value is StepTimer {
  if (typeof value !== "object" || value === null) return false;
  const timer = value as Record<string, unknown>;
  return typeof timer.id === "string" && typeof timer.label === "string" && typeof timer.endsAt === "number" && typeof timer.done === "boolean";
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

/** A short beep-beep-beep with Web Audio, no sound file. The context is made on a tap, which lets it play later. */
function beep(context: AudioContext) {
  try {
    void context.resume?.();
    const start = context.currentTime;
    for (let index = 0; index < 3; index++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      const at = start + index * 0.35;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.3);
    }
  } catch {
    // No sound where Web Audio is missing or blocked.
  }
}

/**
 * The timers of one recipe view: started by tapping a time in a step, kept in
 * sessionStorage by recipe so a reload keeps them, and gone when the tab closes.
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
    setTimers(stored);
    loaded.current = true;
  }, [recipeId]);

  useEffect(() => {
    if (loaded.current) writeTimers(recipeId, timers);
  }, [recipeId, timers]);

  const start = useCallback<StartTimer>(({ key, label, seconds }) => {
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
    setTimers((current) => [...current.filter((timer) => timer.id !== key), { id: key, label, endsAt, done: false }]);
  }, []);

  const finish = useCallback((id: string) => {
    // Once per timer, however often the bar notices it has run out.
    if (alerted.current.has(id)) return;
    alerted.current.add(id);
    setTimers((current) => current.map((timer) => (timer.id === id ? { ...timer, done: true } : timer)));
    try {
      navigator.vibrate?.([300, 150, 300, 150, 300]);
    } catch {
      // No vibration here.
    }
    if (audio.current) beep(audio.current);
  }, []);

  const dismiss = useCallback((id: string) => {
    setTimers((current) => current.filter((timer) => timer.id !== id));
  }, []);

  return { timers, start, finish, dismiss };
}

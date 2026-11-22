"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ListRow } from "@/components/list-row";
import type { ThingCategory } from "../domain/thing";

// "Ta bort föremålet" (UX-B, Pontus 22 Nov): the föremål is deleted at once as before, but the list keeps its row for a few
// seconds, struck through and dimmed, with an "Ångra" pill that counts down and a thin bar that shrinks; then the row is
// gone. Held in memory only: the lists that can show the row (a room's list per photo and per category) say so with
// `useRemovedThingsHost`; where none does (a search hit, a card's own page) the sheet shows the old "Tog bort X" toast instead.

/** How long the row waits for "Ångra". */
export const undoWindowMs = 6000;

export type RemovedThing = {
  id: string;
  name: string;
  /** The card it was on; null for a föremål written in without a card. */
  photoId: string | null;
  category: ThingCategory;
  noted: boolean;
  /** Puts it back (and reads the page again); the row is dropped when it is called. */
  undo: () => void;
  until: number;
};

let removed: readonly RemovedThing[] = [];
const hosts = new Set<symbol>();
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) listener();
}

/** Drops a row at once (its time is out, or "Ångra" was tapped). */
export function dismissRemovedThing(id: string): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  if (!removed.some((entry) => entry.id === id)) return;
  removed = removed.filter((entry) => entry.id !== id);
  emit();
}

/** Keeps a row for `undoWindowMs`. */
export function addRemovedThing(thing: Omit<RemovedThing, "until">): void {
  dismissRemovedThing(thing.id);
  removed = [...removed, { ...thing, until: Date.now() + undoWindowMs }];
  timers.set(thing.id, setTimeout(() => dismissRemovedThing(thing.id), undoWindowMs));
  emit();
}

/** Whether a list on this page shows the row of a removed föremål; the sheet asks before it chooses between the row and the toast. */
export function hasRemovedThingsHost(): boolean {
  return hosts.size > 0;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const none: readonly RemovedThing[] = [];

/** The rows being kept now. */
export function useRemovedThings(): readonly RemovedThing[] {
  return useSyncExternalStore(
    subscribe,
    () => removed,
    () => none,
  );
}

/** A list that shows the rows of removed föremål: while it is mounted the sheet leaves the toast out. */
export function useRemovedThingsHost(): void {
  useEffect(() => {
    const key = Symbol("removed-things-host");
    hosts.add(key);
    return () => {
      hosts.delete(key);
    };
  }, []);
}

/** The row: the name struck through and dimmed, "Ångra" with the seconds left, and a bar that shrinks under it. */
export function RemovedThingRow({ thing }: { thing: RemovedThing }) {
  const [now, setNow] = useState(() => Date.now());
  const [shrink, setShrink] = useState(false);
  const [totalMs] = useState(() => Math.max(0, thing.until - Date.now()));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    const frame = requestAnimationFrame(() => setShrink(true));
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, []);
  const seconds = Math.max(1, Math.ceil((thing.until - now) / 1000));
  return (
    <ListRow
      crossedOut
      srStatus="borttagen"
      title={<span className="opacity-65">{thing.name}</span>}
      className="relative"
      data-testid="thing-removed"
      trailing={
        <>
          <button
            type="button"
            onClick={() => {
              dismissRemovedThing(thing.id);
              thing.undo();
            }}
            aria-label={`Ångra: ${thing.name}`}
            className="inline-flex min-h-tap items-center gap-1.5 rounded-full bg-accent px-4 text-meta font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            data-testid="thing-removed-undo"
          >
            Ångra
            <small aria-hidden="true" className="text-[0.75rem] font-medium opacity-85">
              {seconds} s
            </small>
          </button>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-left bg-accent opacity-55 ease-linear motion-safe:transition-[width]"
            style={{ width: shrink ? "0%" : "100%", transitionDuration: `${totalMs}ms` }}
          />
        </>
      }
    />
  );
}

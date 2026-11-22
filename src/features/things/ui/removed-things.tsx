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

/**
 * A card removed with a swipe (UX-E): its row stays where it was, struck through, with the same "Ångra" for the same
 * time. "Ångra" puts back the card, its photo and all its föremål; when the time is out `onExpire` lets go of the photo's file.
 */
export type RemovedCard = {
  id: string;
  /** The card's name as the row showed it. */
  label: string;
  /** "31 okt · 27 saker", as the row showed it. */
  meta: string;
  /** Where the card was in the room's list, to put the row back there. */
  index: number;
  /** The row's thumbnail as a data URL (the photo is gone from the server while "Ångra" shows); null gives a grey tile. */
  thumb: string | null;
  undo: () => void;
  /** The time ran out without "Ångra". */
  onExpire: () => void;
  until: number;
};

let removed: readonly RemovedThing[] = [];
let removedCards: readonly RemovedCard[] = [];
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

/** Drops a removed card's row at once (its time is out, or "Ångra" was tapped); `onExpire` is not called. */
export function dismissRemovedCard(id: string): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  if (!removedCards.some((entry) => entry.id === id)) return;
  removedCards = removedCards.filter((entry) => entry.id !== id);
  emit();
}

/** Keeps a removed card's row for `undoWindowMs`; when the time runs out the row goes and `onExpire` runs. */
export function addRemovedCard(card: Omit<RemovedCard, "until">): void {
  dismissRemovedCard(card.id);
  removedCards = [...removedCards, { ...card, until: Date.now() + undoWindowMs }];
  timers.set(
    card.id,
    setTimeout(() => {
      dismissRemovedCard(card.id);
      card.onExpire();
    }, undoWindowMs),
  );
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
const noCards: readonly RemovedCard[] = [];

/** The removed cards being kept now. */
export function useRemovedCards(): readonly RemovedCard[] {
  return useSyncExternalStore(
    subscribe,
    () => removedCards,
    () => noCards,
  );
}

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

/** The seconds left of a row's undo time, counted down every quarter second, and whether its bar has started to shrink. */
function useCountdown(until: number) {
  const [now, setNow] = useState(() => Date.now());
  const [shrink, setShrink] = useState(false);
  const [totalMs] = useState(() => Math.max(0, until - Date.now()));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    const frame = requestAnimationFrame(() => setShrink(true));
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, []);
  return { seconds: Math.max(1, Math.ceil((until - now) / 1000)), shrink, totalMs };
}

/** "Ångra" with the seconds left, and a bar that shrinks under the row; the row must be `relative`. */
function UndoTrailing({ until, label, onUndo, testId }: { until: number; label: string; onUndo: () => void; testId: string }) {
  const { seconds, shrink, totalMs } = useCountdown(until);
  return (
    <>
      <button
        type="button"
        onClick={onUndo}
        aria-label={label}
        className="inline-flex min-h-tap items-center gap-1.5 rounded-full bg-accent px-4 text-meta font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        data-testid={testId}
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
  );
}

/** The row: the name struck through and dimmed, "Ångra" with the seconds left, and a bar that shrinks under it. */
export function RemovedThingRow({ thing }: { thing: RemovedThing }) {
  return (
    <ListRow
      crossedOut
      srStatus="borttagen"
      title={<span className="opacity-65">{thing.name}</span>}
      className="relative"
      data-testid="thing-removed"
      trailing={
        <UndoTrailing
          until={thing.until}
          label={`Ångra: ${thing.name}`}
          testId="thing-removed-undo"
          onUndo={() => {
            dismissRemovedThing(thing.id);
            thing.undo();
          }}
        />
      }
    />
  );
}

/** A removed card's row: the card's row as it was (its photo dimmed, its name struck through) with "Ångra" in place of the ⌄. */
export function RemovedCardRow({ card }: { card: RemovedCard }) {
  return (
    <section className="relative overflow-hidden rounded-lg bg-surface" data-testid="card-removed" aria-label={`${card.label}, borttagen`}>
      <div className="flex items-center gap-3 py-2.5 pr-3 pl-3">
        <span className="block size-14 shrink-0 overflow-hidden rounded-md bg-border opacity-55" aria-hidden="true">
          {card.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.thumb} alt="" className="block size-14 object-cover" />
          ) : null}
        </span>
        <span className="flex min-h-tap min-w-0 flex-1 flex-col justify-center">
          <span className="text-row-title font-semibold wrap-break-word text-ink-3 line-through opacity-65">{card.label}</span>
          <span className="text-meta text-ink-3 opacity-65">{card.meta}</span>
        </span>
        <UndoTrailing
          until={card.until}
          label={`Ångra: ${card.label}`}
          testId="card-removed-undo"
          onUndo={() => {
            dismissRemovedCard(card.id);
            card.undo();
          }}
        />
      </div>
    </section>
  );
}

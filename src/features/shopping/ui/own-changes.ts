"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShoppingLine } from "../domain/compute-list";

// What Pontus personally changes on a line, outside a removal (Story 3.6): a
// corrected amount, back to the counted one, or "Visa igen". The list's live
// region never announces these as a recount, so a changed line is "touched"
// from the moment the change starts until the server's list shows it.

/** A change on its way, or done and waiting for the server's list to show it. */
type OwnChange = {
  id: string;
  /** Whether the server's lines show the change; `null` while the action runs. */
  shows: ((lines: readonly ShoppingLine[]) => boolean) | null;
};

export type OwnChanges = {
  /**
   * Starts a change of `key` on `planId`. Call the returned function when the
   * action answers: with how to tell that the server's list shows the change,
   * or with nothing when nothing changed (a failure).
   */
  track: (planId: string, key: string) => (shows?: (lines: readonly ShoppingLine[]) => boolean) => void;
  /** The lines being changed, by `${planId} ${key}`. */
  touched: ReadonlySet<string>;
};

/** Tracks Pontus's own changes for the server's `lines`. */
export function useOwnChanges(lines: readonly ShoppingLine[]): OwnChanges {
  const [changes, setChanges] = useState<ReadonlyMap<number, OwnChange>>(() => new Map());
  const nextToken = useRef(0);
  const serverLines = useRef(lines);
  useEffect(() => {
    serverLines.current = lines;
  }, [lines]);

  const track = useCallback((planId: string, key: string) => {
    nextToken.current += 1;
    const token = nextToken.current;
    const id = `${planId} ${key}`;
    setChanges((current) => {
      // Changes the server's list shows by now are done.
      const next = new Map([...current].filter(([, change]) => !(change.shows && change.shows(serverLines.current))));
      return next.set(token, { id, shows: null });
    });
    return (shows?: (lines: readonly ShoppingLine[]) => boolean) =>
      setChanges((current) => {
        const next = new Map(current);
        if (!shows || shows(serverLines.current)) next.delete(token);
        else next.set(token, { id, shows });
        return next;
      });
  }, []);

  const touched = new Set(
    [...changes.values()].flatMap((change) => (change.shows === null || !change.shows(lines) ? [change.id] : [])),
  );
  return { track, touched };
}

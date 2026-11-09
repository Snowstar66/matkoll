"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parsePicks, togglePick, type TonightPick } from "../domain/tonight";

// Ikväll lives in sessionStorage: it goes when the tab is closed, and nothing is kept as history.

const storageKey = "livskoll-menu-tonight";
const changedEvent = "livskoll-menu-tonight-changed";

function read(): string | null {
  try {
    return sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function write(picks: readonly TonightPick[]) {
  try {
    if (picks.length === 0) sessionStorage.removeItem(storageKey);
    else sessionStorage.setItem(storageKey, JSON.stringify(picks));
  } catch {
    // Storage blocked: the list is gone when the page closes.
  }
  window.dispatchEvent(new Event(changedEvent));
}

function subscribe(listener: () => void) {
  window.addEventListener(changedEvent, listener);
  return () => window.removeEventListener(changedEvent, listener);
}

/** The starred dishes of this session, with a way to star or unstar one and to clear the list. */
export function useTonight(): { picks: TonightPick[]; toggle: (pick: TonightPick) => void; clear: () => void } {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const picks = useMemo(() => parsePicks(stored), [stored]);
  const toggle = useCallback((pick: TonightPick) => write(togglePick(parsePicks(read()), pick)), []);
  const clear = useCallback(() => write([]), []);
  return { picks, toggle, clear };
}

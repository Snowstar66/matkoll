"use client";

import { useCallback, useSyncExternalStore } from "react";

// The chip Snabbt in "Lägg till nya rätter": kept per device (like the other choices there), so it stays on when the
// tab is changed and when the page is opened again.

const storageKey = "livskoll-plan-quick";
const changedEvent = "livskoll-plan-quick-changed";

function read(): boolean {
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changedEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changedEvent, listener);
  };
}

/** Whether the chip Snabbt is on, and how to turn it on or off; off on the server and during the first render. */
export function usePlanQuick(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // Storage blocked: the choice holds until the page is closed.
    }
    try {
      window.dispatchEvent(new Event(changedEvent));
    } catch {
      // No window.
    }
  }, []);
  return [on, set];
}

"use client";

import { useSyncExternalStore } from "react";

// A choice kept on the device, the way recipe-filter-store keeps the filter
// pill: localStorage can be missing or throw (private mode, blocked site
// data); then the choice lives in memory. Storage is tried again on every read,
// so it is used again as soon as it works.

/**
 * A store for one choice under `key`. `parse` reads what was stored (anything
 * unknown, or nothing, gives the default) and `serialize` is what is stored.
 * `use` is `null` until the client has read the choice (the server render and
 * hydration), so the library does not show the default first.
 */
export function createDeviceChoice<T>(key: string, parse: (stored: unknown) => T, serialize: (choice: T) => string) {
  const listeners = new Set<() => void>();
  const initial = parse(null);
  /** The choice when localStorage cannot keep it. */
  let memory = initial;
  /** False after a write failed, until storage takes the choice again. */
  let storageWorks = true;

  // A primitive-valued store: the choices here are strings or null, so the snapshot is stable.
  function read(): T {
    try {
      if (!storageWorks) {
        // Probe: keep the choice made meanwhile, if storage takes it now.
        window.localStorage.setItem(key, serialize(memory));
        storageWorks = true;
      }
      return parse(window.localStorage.getItem(key));
    } catch {
      return memory;
    }
  }

  function write(choice: T) {
    memory = choice;
    try {
      window.localStorage.setItem(key, serialize(choice));
      storageWorks = true;
    } catch {
      storageWorks = false;
    }
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    // A choice made in another tab, or its storage cleared (key null).
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    key,
    /** The chosen value and a function to choose another. */
    use(): [T | undefined, (choice: T) => void] {
      // `undefined` is the server snapshot: no choice has a value of that kind.
      const choice = useSyncExternalStore<T | undefined>(subscribe, read, () => undefined);
      return [choice, write];
    },
    /** Forgets the in-memory choice; for tests. */
    reset() {
      memory = initial;
      storageWorks = true;
    },
  };
}

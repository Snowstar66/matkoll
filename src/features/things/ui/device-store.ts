"use client";

import { useCallback, useSyncExternalStore } from "react";

// Two small things kept on the device (Stories 18.11 and 18.12), like the
// recipe filter: the room a card was last taken in, and which categories of a
// room are open. localStorage can be missing or throw (private mode, blocked
// site data); then the choice lives in memory. Storage is tried again on every
// read, so it is used again as soon as it works. `null` on the server and
// during hydration, so the first render never differs from the server's.

const listeners = new Set<() => void>();
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    // Falls back to memory.
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Kept in memory.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forgets what memory holds; for tests. */
export function resetDeviceStore() {
  memory.clear();
}

function useStored(key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore<string | null>(subscribe, () => read(key), () => null);
  return [value, useCallback((next: string) => write(key, next), [key])];
}

export const lastRoomKey = (siteId: string) => `matkoll.prylar.rum.${siteId}`;
export const openCategoriesKey = (siteId: string, room: string) => `matkoll.prylar.oppna.${siteId}.${room}`;

/** The room a card was last taken in, in this boende, on this device. */
export function useLastRoom(siteId: string): [string | null, (room: string) => void] {
  return useStored(lastRoomKey(siteId));
}

/** The categories of a room that are open (a list of names), on this device. */
export function useOpenCategories(siteId: string, room: string): [string[] | null, (open: string[]) => void] {
  const [raw, set] = useStored(openCategoriesKey(siteId, room));
  let open: string[] | null = null;
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      open = Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string") : [];
    } catch {
      open = [];
    }
  }
  return [open, (names) => set(JSON.stringify(names))];
}

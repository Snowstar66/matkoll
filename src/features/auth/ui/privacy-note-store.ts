"use client";

import { useSyncExternalStore } from "react";

// Whether this device has shown the privacy note once (Story 17.2). Kept in
// localStorage, with no account or database behind it. localStorage can be
// missing or throw (private mode, blocked site data); then the answer lives in
// memory, so the note goes away for the visit and comes back on the next.

export const privacyNoteStorageKey = "matkoll.integritet.okej";

const listeners = new Set<() => void>();
/** The answer when localStorage cannot keep it. */
let memory = false;

function read(): boolean {
  try {
    return memory || window.localStorage.getItem(privacyNoteStorageKey) === "1";
  } catch {
    return memory;
  }
}

function acknowledge() {
  memory = true;
  try {
    window.localStorage.setItem(privacyNoteStorageKey, "1");
  } catch {
    // The note stays gone for this visit only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === privacyNoteStorageKey || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forgets the in-memory answer; for tests. */
export function resetPrivacyNoteStore() {
  memory = false;
}

/**
 * Whether the note has been acknowledged on this device, and a function to
 * acknowledge it. Counts as acknowledged during the server render and
 * hydration, so the note never flashes for someone who has already pressed Okej.
 */
export function usePrivacyNoteAcknowledged(): [boolean, () => void] {
  const acknowledged = useSyncExternalStore(subscribe, read, () => true);
  return [acknowledged, acknowledge];
}

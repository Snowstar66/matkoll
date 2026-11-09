"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parsePeople, removePerson, serializePeople, upsertPerson, withMe } from "../domain/people";
import type { Person } from "../domain/profile";

// The saved profiles (household members and guests kept on purpose) live in this device's localStorage.
// No account, no database: a different phone has its own. Broken or blocked storage reads as "nobody saved".

export const peopleStorageKey = "livskoll-menu-people-v1";
const changedEvent = "livskoll-menu-people-changed";

function read(): string | null {
  try {
    return localStorage.getItem(peopleStorageKey);
  } catch {
    return null;
  }
}

function write(people: readonly Person[]) {
  try {
    localStorage.setItem(peopleStorageKey, serializePeople(people));
  } catch {
    // Storage blocked or full: the change lasts until the page closes at most.
  }
  window.dispatchEvent(new Event(changedEvent));
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changedEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changedEvent, listener);
  };
}

/** The saved people ("Du" first, always), with ways to save (add or change) and remove one. */
export function usePeople(): { people: Person[]; save: (person: Person) => void; remove: (id: string) => void } {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const people = useMemo(() => withMe(parsePeople(stored)), [stored]);
  const save = useCallback((person: Person) => write(upsertPerson(parsePeople(read()), person)), []);
  const remove = useCallback((id: string) => write(removePerson(parsePeople(read()), id)), []);
  return { people, save, remove };
}

/** A fresh id for a person made in this browser. */
export function makePersonId(): string {
  return `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

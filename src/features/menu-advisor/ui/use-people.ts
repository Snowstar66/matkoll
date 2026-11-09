"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { errorMessages } from "@/lib/errors";
import { importLocalProfiles, removeFoodProfile, saveFoodProfile } from "../actions/food-profile";
import { peopleToImport, personKeyOf } from "../domain/food-profile";
import { type HouseholdPerson, parsePeople, removePerson, serializePeople, upsertPerson, withMembers } from "../domain/people";
import type { Person } from "../domain/profile";

// The saved profiles (household members and guests kept on purpose) are the household's: they live in the database
// and follow every phone. The page reads them on the server and hands them over as `profiles`; changes are shown at
// once and saved through server actions. This device's localStorage is the fallback: it is all there is when the
// household's list cannot be read or a save fails ("sparas bara på den här enheten just nu"), and what an older
// version kept there is moved up once. Broken or blocked storage reads as "nobody saved".

export const peopleStorageKey = "livskoll-menu-people-v1";
/** Set when this device's own list has been moved up to the household (or had nothing to move). */
export const importedStorageKey = "livskoll-menu-people-imported-v1";
const changedEvent = "livskoll-menu-people-changed";

export const localOnlyNote = "Sparas bara på den här enheten just nu.";

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

function flag(value: boolean | null): boolean {
  try {
    if (value === true) localStorage.setItem(importedStorageKey, "1");
    else if (value === false) localStorage.removeItem(importedStorageKey);
    else return localStorage.getItem(importedStorageKey) === "1";
  } catch {
    // Without storage the move is tried again next time, which adds nothing that is already there.
  }
  return value ?? false;
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changedEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changedEvent, listener);
  };
}

export type PeopleState = {
  people: Person[];
  save: (person: Person) => void;
  remove: (id: string) => void;
  /** A discreet line to show under the list, or null: where it is kept now, or why the last change did not go through. */
  notice: string | null;
};

/**
 * The people ("Du" first, always, then the household's members from `members`, then those added by hand), with ways
 * to save (add or change) and remove one. `members` null = the household could not be read: only what is saved.
 * `profiles`: the household's saved people read on the server; null = could not be read, so this device's own list.
 */
export function usePeople(members: readonly HouseholdPerson[] | null = null, profiles: Person[] | null = null): PeopleState {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const [remote, setRemote] = useState<Person[] | null>(profiles);
  const [seen, setSeen] = useState(profiles);
  if (profiles !== seen) {
    setSeen(profiles);
    setRemote(profiles);
  }
  const [savedLocally, setSavedLocally] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const importing = useRef(false);
  const shared = remote !== null;
  const meUserId = members?.find((member) => member.isMe)?.id ?? null;

  const people = useMemo(() => withMembers(shared ? remote : parsePeople(stored), members), [shared, remote, stored, members]);

  // Saves go one after the other, so two quick changes of one person arrive in order.
  const later = useCallback((job: () => Promise<void>) => {
    queue.current = queue.current.then(job, job);
  }, []);

  const save = useCallback(
    (person: Person) => {
      setProblem(null);
      if (!shared) {
        write(upsertPerson(parsePeople(read()), person));
        return;
      }
      setRemote((current) => upsertPerson(current ?? [], person));
      later(async () => {
        const result = await saveFoodProfile(person).catch(() => null);
        if (result?.ok) return;
        // The household's list did not take it: keep it on this device and move it up next time.
        write(upsertPerson(parsePeople(read()), person));
        flag(false);
        setSavedLocally(true);
      });
    },
    [shared, later],
  );

  const remove = useCallback(
    (id: string) => {
      setProblem(null);
      if (!shared) {
        write(removePerson(parsePeople(read()), id));
        return;
      }
      let removed: Person | undefined;
      setRemote((current) => {
        removed = current?.find((person) => person.id === id);
        return removePerson(current ?? [], id);
      });
      later(async () => {
        const result = await removeFoodProfile(id).catch(() => null);
        if (result?.ok) return;
        // Not removed for the household: it comes back, with the reason.
        if (removed) setRemote((current) => upsertPerson(current ?? [], removed!));
        setProblem(errorMessages.food_profile_failed);
      });
    },
    [shared, later],
  );

  // Once per device: what an older version kept in localStorage moves up, for the people the household has no row
  // for. A row that exists is never overwritten, and the local copy stays until the move has succeeded.
  useEffect(() => {
    if (!shared || !members || importing.current || flag(null)) return;
    const keys = new Set((remote ?? []).flatMap((person) => personKeyOf(person.id, meUserId) ?? []));
    const wanted = peopleToImport(parsePeople(read()), keys, meUserId);
    importing.current = true;
    if (wanted.length === 0) {
      flag(true);
      return;
    }
    void importLocalProfiles(wanted)
      .catch(() => null)
      .then((result) => {
        if (!result?.ok) {
          // Tried again the next time the page opens.
          importing.current = false;
          return;
        }
        flag(true);
        setRemote((current) => [...(current ?? []), ...result.data.filter((person) => !(current ?? []).some((entry) => entry.id === person.id))]);
      });
  }, [shared, members, meUserId, remote]);

  const notice = problem ?? (!shared || savedLocally ? localOnlyNote : null);
  return { people, save, remove, notice };
}

/** A fresh id for a person made in this browser. */
export function makePersonId(): string {
  return `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

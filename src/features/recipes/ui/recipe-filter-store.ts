"use client";

import { useSyncExternalStore } from "react";
import { parseRecipeFilter, type RecipeFilter } from "../domain/recipe-list";

// The library's filter pill, kept on the device (EXPERIENCE.md, Filterpiller).
// localStorage can be missing or throw (private mode, blocked site data);
// then the choice lives in memory, and Alla is the default. Storage is tried
// again on every read, so it is used again as soon as it works.

export const recipeFilterStorageKey = "matkoll.recept.filter";

const listeners = new Set<() => void>();
/** The choice when localStorage cannot keep it. */
let memory: RecipeFilter = "all";
/** False after a write failed, until storage takes the choice again. */
let storageWorks = true;

function read(): RecipeFilter {
  try {
    if (!storageWorks) {
      // Probe: keep the choice made meanwhile, if storage takes it now.
      window.localStorage.setItem(recipeFilterStorageKey, memory);
      storageWorks = true;
    }
    return parseRecipeFilter(window.localStorage.getItem(recipeFilterStorageKey));
  } catch {
    return memory;
  }
}

function write(filter: RecipeFilter) {
  memory = filter;
  try {
    window.localStorage.setItem(recipeFilterStorageKey, filter);
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
    if (event.key === recipeFilterStorageKey || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Forgets the in-memory choice; for tests. */
export function resetRecipeFilterStore() {
  memory = "all";
  storageWorks = true;
}

/**
 * The chosen filter and a function to choose another. `null` until the
 * client has read the saved choice (the server render and hydration), so the
 * library does not show Alla first when Favoriter is saved.
 */
export function useRecipeFilter(): [RecipeFilter | null, (filter: RecipeFilter) => void] {
  const filter = useSyncExternalStore<RecipeFilter | null>(subscribe, read, () => null);
  return [filter, write];
}

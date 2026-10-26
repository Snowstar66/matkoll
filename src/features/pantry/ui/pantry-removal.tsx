"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { fail, type Result } from "@/lib/errors";
import { removePantryItem } from "../actions/remove-pantry-item";
import { restorePantryItem } from "../actions/restore-pantry-item";
import { comparePantryItems, type PantryItem } from "../domain/pantry-item";
import type { PantryRow } from "../domain/pantry-item-form";
import { removedItemsText } from "../domain/places";

// Removing a pantry item with "Ångra" (FR-11, Story 2.3): no question first
// (EXPERIENCE.md, Interaction Primitives). The item leaves the list at once
// and the short confirmation offers "Ångra" for 5 s, which puts the row back
// with the same id (AD-20). A swipe on a row and "Ta bort" in the sheet
// Lagervara both come here.

/** A change the list shows before the server's list has it. */
export type PantryChange = { kind: "remove" | "restore"; item: PantryItem };

/** Same ingredient and location, and the same unit or either one unlimited: they cannot both be there. */
function conflicts(a: PantryItem, b: PantryItem): boolean {
  return (
    a.ingredientId === b.ingredientId &&
    a.location === b.location &&
    (a.unit === null || b.unit === null || a.unit === b.unit)
  );
}

/**
 * `items` of `location` with the pending changes applied, in Hemma's order: a
 * removed item is left out, a restored one of this location is back in,
 * unless the list has it already or has a row it would conflict with.
 */
export function applyPantryChanges(
  items: readonly PantryItem[],
  location: Location,
  changes: readonly PantryChange[],
): readonly PantryItem[] {
  if (changes.length === 0) return items;
  let shown = [...items];
  for (const { kind, item } of changes) {
    if (kind === "remove") {
      shown = shown.filter((other) => other.id !== item.id);
    } else if (item.location === location && !shown.some((other) => other.id === item.id || conflicts(other, item))) {
      shown = [...shown, item].sort(comparePantryItems);
    }
  }
  return shown;
}

/**
 * A removal or "Ångra" the list shows before the server's list has it.
 * `token` tells this one from a later change of the same item.
 */
type Entry = PantryChange & {
  token: number;
  /** The action has answered. */
  settled: boolean;
  /** The server's items of the item's location when the action answered. */
  seen?: readonly PantryItem[];
};

/**
 * Whether the server's `items` of the entry's location show the change, so
 * the entry can go: a removed item is no longer there; a restored one is
 * there, or the items have been read again since (it may have been changed
 * in the meantime).
 */
function serverHas(entry: Entry, items: readonly PantryItem[] | undefined): boolean {
  if (!items) return false;
  const listed = items.some((item) => item.id === entry.item.id);
  if (entry.kind === "remove") return !listed;
  return listed || (entry.seen !== undefined && entry.seen !== items);
}

type PantryRemovalApi = {
  /**
   * Removes the item at once; the short confirmation offers "Ångra".
   * `moveFocus` (keyboard, sheet): focus goes to the next item afterwards.
   */
  removeItem: (item: PantryItem, options?: { moveFocus?: boolean }) => void;
  /** The changes waiting for the server's list; see applyPantryChanges. */
  changes: readonly PantryChange[];
  /** Tells the removals the server's items of a location, as Hemma shows them. */
  report: (location: Location, items: readonly PantryItem[]) => void;
  /** The id of an item just removed with `moveFocus`, until the list has moved focus. */
  focusAfter: string | null;
  focusMoved: () => void;
};

const PantryRemovalContext = createContext<PantryRemovalApi | null>(null);

/** Removing items on Hemma; needs a PantryRemovalProvider (inside PantrySheetProvider) above. */
export function usePantryRemoval(): PantryRemovalApi {
  const api = useContext(PantryRemovalContext);
  if (!api) throw new Error("usePantryRemoval needs a PantryRemovalProvider");
  return api;
}

type Removed = { item: PantryItem; row: PantryRow };

/**
 * Holds the removals for Hemma. The list follows at once: a removed item is
 * gone while removePantryItem runs and stays gone until the server's list no
 * longer has it, so it never flashes back; "Ångra" shows it again until the
 * server's list has it. Items removed while the confirmation shows join it
 * ("Mjölk och Smör är borttagna."), and "Ångra" puts them all back. A failed
 * removal brings the item back, and a failed "Ångra" takes it away again,
 * each with a short confirmation announced as an alert, since the toasts
 * outlive a change of location. When an action gets no answer, the page is
 * read again so the list shows what is saved.
 */
export function PantryRemovalProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());
  const [focusAfter, setFocusAfter] = useState<string | null>(null);
  const nextToken = useRef(0);
  /** The server's items per location, as last reported. */
  const serverItems = useRef(new Map<Location, readonly PantryItem[]>());
  /** The items removed under the confirmation showing now; a new object per confirmation. */
  const batch = useRef<{ removed: readonly Removed[] } | null>(null);

  const begin = useCallback((kind: Entry["kind"], item: PantryItem): number => {
    nextToken.current += 1;
    const token = nextToken.current;
    setEntries((current) => new Map(current).set(item.id, { kind, item, token, settled: false }));
    return token;
  }, []);

  /** The action failed: the list shows the server's items again. */
  const drop = useCallback((id: string, token: number) => {
    setEntries((current) => {
      if (current.get(id)?.token !== token) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  /** The action succeeded: the entry stays until the server's list shows the change. */
  const settle = useCallback((id: string, token: number) => {
    setEntries((current) => {
      const entry = current.get(id);
      if (entry?.token !== token) return current;
      const items = serverItems.current.get(entry.item.location);
      const next = new Map(current);
      const settled: Entry = { ...entry, settled: true, seen: items };
      if (items && serverHas({ ...settled, seen: undefined }, items)) next.delete(id);
      else next.set(id, settled);
      return next;
    });
  }, []);

  const report = useCallback((location: Location, items: readonly PantryItem[]) => {
    serverItems.current.set(location, items);
    setEntries((current) => {
      const done = [...current.values()].filter(
        (entry) => entry.settled && entry.item.location === location && serverHas(entry, items),
      );
      if (done.length === 0) return current;
      const next = new Map(current);
      for (const entry of done) next.delete(entry.item.id);
      return next;
    });
  }, []);

  function failed(message: string, lost: boolean) {
    showToast(message, { role: "alert" });
    if (lost) router.refresh();
  }

  async function removeItem(item: PantryItem, options?: { moveFocus?: boolean }) {
    const token = begin("remove", item);
    if (options?.moveFocus) setFocusAfter(item.id);
    let result: Result<PantryRow | null>;
    let lost = false;
    try {
      result = await removePantryItem(item.id);
    } catch {
      // No answer (e.g. no connection): the item comes back until the page is read again.
      result = fail("pantry_remove_failed");
      lost = true;
    }
    if (!result.ok) {
      drop(item.id, token);
      failed(result.error.message, lost);
      return;
    }
    settle(item.id, token);
    if (result.data === null) {
      // Gone, but it cannot be put back.
      showToast(removedItemsText([item.name]));
      return;
    }
    confirmRemoved({ item, row: result.data });
  }

  function confirmRemoved(removed: Removed) {
    const all = [...(batch.current?.removed ?? []).filter((other) => other.item.id !== removed.item.id), removed];
    const current = { removed: all };
    batch.current = current;
    const forget = () => {
      if (batch.current === current) batch.current = null;
    };
    showToast(removedItemsText(all.map(({ item }) => item.name)), {
      onUndo: () => {
        forget();
        void restoreAll(all);
      },
      onClose: forget,
    });
  }

  async function restoreAll(removed: readonly Removed[]) {
    const results = await Promise.all(
      removed.map(async ({ item, row }) => {
        const token = begin("restore", { ...item, ...row });
        try {
          const result = await restorePantryItem(row);
          if (result.ok) settle(item.id, token);
          else drop(item.id, token);
          return { result, lost: false };
        } catch {
          drop(item.id, token);
          return { result: fail("pantry_restore_failed"), lost: true };
        }
      }),
    );
    const failure = results.find(({ result }) => !result.ok);
    if (failure && !failure.result.ok) failed(failure.result.error.message, results.some(({ lost }) => lost));
  }

  const changes = useMemo(() => [...entries.values()].map(({ kind, item }) => ({ kind, item })), [entries]);
  const focusMoved = useCallback(() => setFocusAfter(null), []);
  const api: PantryRemovalApi = {
    removeItem: (item, options) => void removeItem(item, options),
    changes,
    report,
    focusAfter,
    focusMoved,
  };
  return <PantryRemovalContext.Provider value={api}>{children}</PantryRemovalContext.Provider>;
}

"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import { emptyPantryPlace } from "../actions/empty-pantry-place";
import { removePantryItem } from "../actions/remove-pantry-item";
import { restorePantryItem } from "../actions/restore-pantry-item";
import { restorePantryRemoval } from "../actions/restore-pantry-removal";
import { comparePantryItems, type PantryItem } from "../domain/pantry-item";
import type { PantryRow } from "../domain/pantry-item-form";
import { withoutPlace, withRestoredPlace, withRestoredStock } from "../domain/pantry-suggestion";
import {
  alreadyEmptyText,
  emptiedPlaceText,
  maybeEmptiedText,
  notRestoredText,
  removedCountText,
  removedItemsText,
} from "../domain/places";
import { usePantrySuggestions } from "./pantry-suggestions";
import { useLiveUndo } from "./site-switching";

// Removing a pantry item with "Ångra" (FR-11, Story 2.3): no question first
// (EXPERIENCE.md, Interaction Primitives). The item leaves the list at once
// and the short confirmation offers "Ångra" for 5 s, which puts the row back
// with the same id (AD-20). A swipe on a row and "Ta bort" in the sheet
// Lagervara both come here. "Töm kylen" (Story 6.3) comes here too, after
// its sheet has asked: one call empties the location under an operation id,
// the server keeps the removed rows, and "Ångra" puts them all back by that
// id in one call.
//
// Places (Story 8.2, FR-33, AD-24): the changes are kept per place and
// location. A removal is by the row's id, which is unique over all places,
// and "Ångra" puts the row back on its own place, also when Hemma shows
// another place by then; the list shows a restored row only when it is on
// the place and in the location shown. While a confirmation with "Ångra"
// shows, its places are marked (useLiveUndo), so the sheet Ställen offers no
// "Ta bort" for a place the rows could not go back to.

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

/** The key of a place's location, for what the removals keep per place and location. */
function placeKey(siteId: string, location: Location): string {
  return `${siteId}:${location}`;
}

/**
 * `items` of `location` on the place `siteId` with the pending changes
 * applied, in Hemma's order: a removed item is left out (by id), a restored
 * one of this place and location is back in, unless the list has it already
 * or has a row it would conflict with.
 */
export function applyPantryChanges(
  items: readonly PantryItem[],
  siteId: string,
  location: Location,
  changes: readonly PantryChange[],
): readonly PantryItem[] {
  if (changes.length === 0) return items;
  let shown = [...items];
  for (const { kind, item } of changes) {
    if (kind === "remove") {
      shown = shown.filter((other) => other.id !== item.id);
    } else if (
      item.siteId === siteId &&
      item.location === location &&
      !shown.some((other) => other.id === item.id || conflicts(other, item))
    ) {
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
  /** The server's items of the item's place and location when the action answered. */
  seen?: readonly PantryItem[];
};

/**
 * Whether the server's `items` of the entry's place and location show the change, so
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
  /**
   * "Töm kylen" after the sheet has asked: empties `location` of the place
   * Hemma shows (`siteId`) on the server under `operationId` (not
   * optimistically), then hides its rows at once and
   * confirms with "Ångra". `items` are the rows the list shows, for their
   * names. A failure is returned for the sheet to show; nothing is removed
   * then. When the answer is lost, the page is read again, and if the
   * location then looks empty, "Kylen kan ha tömts." offers "Ångra" by the
   * operation id. The same id again is a safe retry.
   */
  emptyPlace: (
    siteId: string,
    location: Location,
    items: readonly PantryItem[],
    operationId: string,
  ) => Promise<Result<{ removed: number }>>;
  /** A removal, "Ångra" or emptying of the place's location is on its way: "Töm kylen" waits. */
  isPending: (siteId: string, location: Location) => boolean;
  /** The changes waiting for the server's list; see applyPantryChanges. */
  changes: readonly PantryChange[];
  /** Tells the removals the server's items of a place's location, as Hemma shows them. */
  report: (siteId: string, location: Location, items: readonly PantryItem[]) => void;
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

/** A single item removed, and its row as it was. */
type Removed = { item: PantryItem; row: PantryRow };

/** An emptied location of a place, whose rows the server keeps under the operation id. */
type Operation = {
  id: string;
  siteId: string;
  location: Location;
  /** How many rows it removed; `null` when the answer was lost. */
  count: number | null;
  /** The items the list showed, which "Ångra" shows again at once. */
  known: readonly PantryItem[];
};

/** Everything one confirmation's "Ångra" puts back. */
type Batch = { singles: readonly Removed[]; operations: readonly Operation[] };

/** How one restore went, for the confirmation after "Ångra". */
type Outcome = { ok: true; skipped: number } | { ok: false; message: string; lost: boolean };

/** How long after a lost answer a location seen empty counts as emptied by it. */
export const lostEmptyWindowMs = 30_000;

/** The confirmation's text for what "Ångra" would put back. */
function batchText({ singles, operations }: Batch): string {
  if (operations.length === 0) return removedItemsText(singles.map(({ item }) => item.name));
  const unknown = operations.find((operation) => operation.count === null);
  if (unknown) return maybeEmptiedText(unknown.location);
  if (singles.length === 0 && operations.length === 1) return emptiedPlaceText(operations[0].location, operations[0].count ?? 0);
  const count = operations.reduce((sum, operation) => sum + (operation.count ?? 0), singles.length);
  return removedCountText(count, [...operations.map(({ location }) => location), ...singles.map(({ item }) => item.location)]);
}

/** A row removed from `location` of the place that the list did not show: only its id counts. */
const unnamed = (id: string, siteId: string, location: Location): PantryItem => ({
  id,
  siteId,
  ingredientId: "",
  name: "",
  location,
  amount: null,
  unit: null,
});

/**
 * Holds the removals for Hemma. The list follows at once: a removed item is
 * gone while removePantryItem runs and stays gone until the server's list no
 * longer has it, so it never flashes back; "Ångra" shows it again until the
 * server's list has it. Removals while the confirmation shows join it
 * ("Mjölk och Smör är borttagna."), also an emptied location and single
 * items together ("Tog bort 15 varor ur kylen."), and "Ångra" puts them all
 * back. A failed removal brings the item back, and a failed "Ångra" takes it
 * away again, each with a short confirmation announced as an alert, since
 * the toasts outlive a change of location. When an action gets no answer,
 * the page is read again so the list shows what is saved. Needs a
 * PantrySuggestionsProvider above: emptying and "Ångra" keep "I kylen nu" on
 * the lagerförslag true, and emptying the photographed location ends its
 * comparison (Story 6.4): the suggestions become a plain list.
 */
export function PantryRemovalProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const router = useRouter();
  const { editResult, editSuggestions, generation } = usePantrySuggestions();
  const { holdUndo } = useLiveUndo();
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());
  const [focusAfter, setFocusAfter] = useState<string | null>(null);
  /** Emptying and "Ångra" by operation on their way, per place and location (placeKey). */
  const [inFlight, setInFlight] = useState<ReadonlyMap<string, number>>(() => new Map());
  const nextToken = useRef(0);
  /** The server's items per place and location (placeKey), as last reported. */
  const serverItems = useRef(new Map<string, readonly PantryItem[]>());
  /** What the confirmation showing now puts back; a new object per confirmation. */
  const batch = useRef<Batch | null>(null);
  /** An emptying whose answer was lost, until the location's items are read again. */
  const lostEmpty = useRef<{ operation: Operation; at: number } | null>(null);
  /** What `report` does besides keeping the server's items; set after each render. */
  const onReport = useRef<(siteId: string, location: Location, items: readonly PantryItem[]) => void>(() => {});

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
      const items = serverItems.current.get(placeKey(entry.item.siteId, entry.item.location));
      const next = new Map(current);
      const settled: Entry = { ...entry, settled: true, seen: items };
      if (items && serverHas({ ...settled, seen: undefined }, items)) next.delete(id);
      else next.set(id, settled);
      return next;
    });
  }, []);

  /** Rows put back that the list did not show: their removals go, so the server's list shows them. */
  const forgetRemovals = useCallback((ids: readonly string[]) => {
    setEntries((current) => {
      const gone = ids.filter((id) => current.get(id)?.kind === "remove");
      if (gone.length === 0) return current;
      const next = new Map(current);
      for (const id of gone) next.delete(id);
      return next;
    });
  }, []);

  const report = useCallback((siteId: string, location: Location, items: readonly PantryItem[]) => {
    serverItems.current.set(placeKey(siteId, location), items);
    setEntries((current) => {
      const done = [...current.values()].filter(
        (entry) =>
          entry.settled && entry.item.siteId === siteId && entry.item.location === location && serverHas(entry, items),
      );
      if (done.length === 0) return current;
      const next = new Map(current);
      for (const entry of done) next.delete(entry.item.id);
      return next;
    });
    onReport.current(siteId, location, items);
  }, []);

  function markInFlight(siteId: string, location: Location, change: 1 | -1) {
    const key = placeKey(siteId, location);
    setInFlight((current) => new Map(current).set(key, (current.get(key) ?? 0) + change));
  }

  function failed(message: string, lost: boolean) {
    showToast(message, { role: "alert" });
    if (lost) router.refresh();
  }

  async function restoreSingle({ item, row }: Removed): Promise<Outcome> {
    const token = begin("restore", { ...item, ...row });
    try {
      const result = await restorePantryItem(row);
      if (result.ok) {
        settle(item.id, token);
        return { ok: true, skipped: 0 };
      }
      drop(item.id, token);
      return { ok: false, message: result.error.message, lost: false };
    } catch {
      drop(item.id, token);
      return { ok: false, message: fail("pantry_restore_failed").error.message, lost: true };
    }
  }

  /**
   * Puts an emptied location back by its operation id: the items the list
   * showed come back at once; rows the server skipped (the location has the
   * item again) go again, and every row put back loses its removal, also one
   * the list never showed.
   */
  async function restoreOperation(operation: Operation): Promise<Outcome> {
    markInFlight(operation.siteId, operation.location, 1);
    const tokens = new Map(operation.known.map((item) => [item.id, begin("restore", item)]));
    let result: Awaited<ReturnType<typeof restorePantryRemoval>>;
    let lost = false;
    try {
      result = await restorePantryRemoval(operation.id);
    } catch {
      result = fail("pantry_restore_failed");
      lost = true;
    } finally {
      markInFlight(operation.siteId, operation.location, -1);
    }
    if (!result.ok) {
      for (const [id, token] of tokens) drop(id, token);
      return { ok: false, message: result.error.message, lost };
    }
    const back = new Set(result.data.restoredIds);
    for (const [id, token] of tokens) {
      if (back.has(id)) settle(id, token);
      else drop(id, token);
    }
    forgetRemovals(result.data.restoredIds.filter((id) => !tokens.has(id)));
    const rows = result.data.rows;
    editSuggestions(generation(), (suggestions) => withRestoredStock(suggestions, operation.location, rows));
    // A photo compared with the location before it was emptied no longer matches it (Story 6.4).
    editResult(generation(), (result) => withRestoredPlace(result, operation.location));
    return { ok: true, skipped: result.data.skipped };
  }

  /** "Ångra" for a confirmation: everything in it back, then one alert for what failed or was skipped. */
  async function undo({ singles, operations }: Batch) {
    const outcomes = await Promise.all([...singles.map(restoreSingle), ...operations.map(restoreOperation)]);
    const failures = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome]));
    if (failures.length > 0) {
      failed(failures[0].message, failures.some(({ lost }) => lost));
      return;
    }
    const skipped = outcomes.reduce((sum, outcome) => sum + (outcome.ok ? outcome.skipped : 0), 0);
    if (skipped > 0) showToast(notRestoredText(skipped), { role: "alert" });
  }

  /**
   * Shows the confirmation for `next`, whose "Ångra" puts everything in it
   * back. Its places stay marked until the confirmation goes, or until
   * "Ångra" has answered.
   */
  function showBatch(next: Batch) {
    batch.current = next;
    const sites = [...next.singles.map(({ item }) => item.siteId), ...next.operations.map(({ siteId }) => siteId)];
    const release = holdUndo([...new Set(sites)]);
    const forget = () => {
      if (batch.current === next) batch.current = null;
    };
    showToast(batchText(next), {
      onUndo: () => {
        forget();
        void undo(next).finally(release);
      },
      onClose: () => {
        forget();
        release();
      },
    });
  }

  /** `operation` joins the confirmation showing now, replacing an earlier one with the same id. */
  function confirmOperation(operation: Operation) {
    const others = (batch.current?.operations ?? []).filter((other) => other.id !== operation.id);
    showBatch({ singles: batch.current?.singles ?? [], operations: [...others, operation] });
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
    const removed = { item, row: result.data };
    const singles = [...(batch.current?.singles ?? []).filter((other) => other.item.id !== item.id), removed];
    showBatch({ singles, operations: batch.current?.operations ?? [] });
  }

  // The place is the one Hemma shows; emptyPantryPlace sends it from Story 8.4
  // on, and until then empties the place selected when the call arrives.
  async function emptyPlace(
    siteId: string,
    location: Location,
    items: readonly PantryItem[],
    operationId: string,
  ): Promise<Result<{ removed: number }>> {
    markInFlight(siteId, location, 1);
    let result: Awaited<ReturnType<typeof emptyPantryPlace>>;
    let lost = false;
    try {
      result = await emptyPantryPlace(location, operationId);
    } catch {
      result = fail("pantry_empty_failed");
      lost = true;
    } finally {
      markInFlight(siteId, location, -1);
    }
    if (lost) {
      // No answer (e.g. no connection): it may have been emptied. The page is
      // read again, and `report` offers "Ångra" if the location is empty then.
      lostEmpty.current = { operation: { id: operationId, siteId, location, count: null, known: items }, at: Date.now() };
      router.refresh();
      return result;
    }
    if (!result.ok) {
      // An expired session: the page sends Pontus to sign in.
      if (result.error.code === "unauthorized") router.refresh();
      return result;
    }
    if (lostEmpty.current?.operation.id === operationId) lostEmpty.current = null;
    const { removed, removedIds } = result.data;
    const shown = new Map(items.map((item) => [item.id, item]));
    // The list is empty at once, also of rows another tab added (only the id counts for them).
    for (const id of removedIds) settle(id, begin("remove", shown.get(id) ?? unnamed(id, siteId, location)));
    editResult(generation(), (result) => withoutPlace(result, location));
    if (removed > 0) {
      const ids = new Set(removedIds);
      confirmOperation({
        id: operationId,
        siteId,
        location,
        count: removed,
        known: items.filter((item) => ids.has(item.id)),
      });
    } else if (!batch.current) {
      // Nothing to undo; a confirmation with "Ångra" that shows stays.
      showToast(alreadyEmptyText(location));
    }
    return ok({ removed });
  }

  // After a lost answer to "Töm kylen": the location's items as read again tell whether it was emptied.
  useEffect(() => {
    onReport.current = (siteId, location, items) => {
      const lost = lostEmpty.current;
      if (!lost || lost.operation.siteId !== siteId || lost.operation.location !== location) return;
      lostEmpty.current = null;
      if (items.length > 0 || Date.now() - lost.at > lostEmptyWindowMs) return;
      editResult(generation(), (result) => withoutPlace(result, location));
      confirmOperation(lost.operation);
    };
  });

  const changes = useMemo(() => [...entries.values()].map(({ kind, item }) => ({ kind, item })), [entries]);
  const pending = useMemo(() => {
    const places = new Set<string>();
    for (const [key, count] of inFlight) if (count > 0) places.add(key);
    for (const entry of entries.values()) if (!entry.settled) places.add(placeKey(entry.item.siteId, entry.item.location));
    return places;
  }, [entries, inFlight]);
  const focusMoved = useCallback(() => setFocusAfter(null), []);
  const api: PantryRemovalApi = {
    removeItem: (item, options) => void removeItem(item, options),
    emptyPlace,
    isPending: (siteId, location) => pending.has(placeKey(siteId, location)),
    changes,
    report,
    focusAfter,
    focusMoved,
  };
  return <PantryRemovalContext.Provider value={api}>{children}</PantryRemovalContext.Provider>;
}

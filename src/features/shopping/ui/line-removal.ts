"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { removedItemsText } from "@/features/pantry";
import { fail, type Result } from "@/lib/errors";
import { hideLine } from "../actions/hide-line";
import { removeCustomItem } from "../actions/remove-custom-item";
import { restoreCustomItem } from "../actions/restore-custom-item";
import { restoreLine } from "../actions/restore-line";
import { compareShoppingLines, type ShoppingLine } from "../domain/compute-list";
import { parseLineKey } from "../domain/line-key";
import { lineName, restoreFailedText } from "../domain/list-text";

// "Ta bort" on a list line with "Ångra" (FR-17, AD-20): no question first
// (EXPERIENCE.md, Interaction Primitives). The line leaves the list at once
// and the short confirmation offers "Ångra" for 5 s. An own item (Story 3.5)
// is deleted for good and "Ångra" puts it back with the same id, so under the
// same section and with the same check. A recipe line (Story 3.6) is hidden
// for as long as it keeps its key, and "Ångra" puts its override back as it
// was, so it comes back with the corrected amount it had. The same pattern
// as the pantry (Story 2.3) and the meal plan (Story 3.1).

/** A removal or "Ångra" the list shows before the server's list has it. */
type Entry = {
  kind: "remove" | "restore";
  /** The plan the list showed: the change applies to that plan's list only. */
  planId: string;
  /** The line as it was shown, so "Ångra" shows it again as it was. */
  line: ShoppingLine;
  /** Tells this change from a later change of the same line. */
  token: number;
  /** The action has answered. */
  settled: boolean;
  /** The server's lines when the action answered. */
  seen?: readonly ShoppingLine[];
};

/** An entry's key: per plan, so a change never shows on another plan's list. */
const entryId = (planId: string, key: string) => `${planId} ${key}`;

/** What a week without a plan, which has only own items, is kept under (Story 17.10). */
const ownScope = "own";

/**
 * Whether the server's `lines` show the change, so the entry can go: a
 * removed line is no longer there; a restored one is there, or the list has
 * been read again since (it may have been removed elsewhere meanwhile).
 */
function serverHas(entry: Entry, lines: readonly ShoppingLine[]): boolean {
  const listed = lines.some((line) => line.key === entry.line.key);
  if (entry.kind === "remove") return !listed;
  return listed || (entry.seen !== undefined && entry.seen !== lines);
}

/** The server's lines with the plan's pending changes applied, in the list's order. */
export function applyRemovals(lines: readonly ShoppingLine[], entries: Iterable<Pick<Entry, "kind" | "line">>): ShoppingLine[] {
  let shown = [...lines];
  let added = false;
  for (const { kind, line } of entries) {
    if (kind === "remove") shown = shown.filter((other) => other.key !== line.key);
    else if (!shown.some((other) => other.key === line.key)) {
      shown.push(line);
      added = true;
    }
  }
  return added ? shown.sort(compareShoppingLines) : shown;
}

/** A removed line and how "Ångra" puts it back on the plan it was removed from. */
type Removed = { line: ShoppingLine; planId: string; undo: () => Promise<Result<unknown>> };

export type LineRemoval = {
  /** `lines` with the removals and "Ångra" not yet in the server's list. */
  shown: readonly ShoppingLine[];
  /**
   * Removes the line at once (an own item) or hides it (a recipe line); the
   * short confirmation offers "Ångra". `moveFocus` (keyboard, or "Ta bort"
   * in the detail): focus goes to the next line afterwards.
   */
  remove: (line: ShoppingLine, moveFocus: boolean) => void;
  /** The key of a line just removed with `moveFocus`, until the list has moved focus. */
  focusAfterRef: RefObject<string | null>;
  /**
   * The lines Pontus is removing or putting back on this list, by
   * `${planId} ${key}`, until the server's list shows it: what Pontus
   * does is never announced as a recount.
   */
  touched: ReadonlySet<string>;
};

/**
 * Holds the removals for the list of `planId`. A removed line is gone while
 * removeCustomItem or hideLine runs and stays gone until the server's list no
 * longer has it, so it never flashes back; "Ångra" shows it again until the
 * server's list has it. Lines removed while the confirmation shows join it
 * ("Grädde och diskmedel är borttagna."), and "Ångra" puts them all back. A
 * failed removal brings the line back, and a failed "Ångra" takes it away
 * again, each with a short confirmation announced as an alert; when only
 * some of several could be put back, the alert names the others. A lost
 * answer, or a plan switched elsewhere, reads the list again; hiding a recipe
 * line is tried once more first, since it is idempotent and its answer is
 * what "Ångra" needs. A line already being removed is not removed again.
 */
export function useLineRemoval(planId: string | null, lines: readonly ShoppingLine[]): LineRemoval {
  const router = useRouter();
  const { showToast } = useToast();
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());
  const focusAfterRef = useRef<string | null>(null);
  /** The lines whose removal is on its way, so a second tap does nothing. */
  const removing = useRef(new Set<string>());
  const nextToken = useRef(0);
  const serverLines = useRef(lines);
  /** The items removed under the confirmation showing now; a new object per confirmation. */
  const batch = useRef<{ removed: readonly Removed[] } | null>(null);

  useEffect(() => {
    serverLines.current = lines;
  }, [lines]);

  const begin = useCallback((kind: Entry["kind"], plan: string, line: ShoppingLine): number => {
    nextToken.current += 1;
    const token = nextToken.current;
    setEntries((current) => {
      // Entries the server's list shows by now are done.
      const next = new Map([...current].filter(([, entry]) => !(entry.settled && serverHas(entry, serverLines.current))));
      return next.set(entryId(plan, line.key), { kind, planId: plan, line, token, settled: false });
    });
    return token;
  }, []);

  /** The action failed: the list shows the server's lines again. */
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
      const next = new Map(current);
      const settled: Entry = { ...entry, settled: true };
      if (serverHas(settled, serverLines.current)) next.delete(id);
      else next.set(id, { ...settled, seen: serverLines.current });
      return next;
    });
  }, []);

  /**
   * A toast that is not a removal's confirmation: items removed after it
   * start a new confirmation, never join one that is gone.
   */
  function showOther(message: string, role?: "alert") {
    batch.current = null;
    showToast(message, role ? { role } : undefined);
  }

  function failed(result: Result<unknown>, lost: boolean, message?: string) {
    if (result.ok) return;
    if (result.error.code === "unauthorized") {
      router.refresh();
      return;
    }
    showOther(result.error.code === "shopping_plan_changed" ? result.error.message : (message ?? result.error.message), "alert");
    if (lost || result.error.code === "shopping_plan_changed") router.refresh();
  }

  /**
   * Removes the line on the server: an own item for good, a recipe line
   * hidden. Gives how "Ångra" puts it back, `null` when it is gone but cannot
   * be put back, or the failure. Hiding is idempotent, so a lost answer is
   * tried once more; a second lost answer throws.
   */
  async function removeOnServer(
    line: ShoppingLine,
    plan: string,
  ): Promise<{ result: Result<unknown>; undo?: Removed["undo"] | null }> {
    const parsed = parseLineKey(line.key);
    if (parsed?.kind === "custom") {
      const result = await removeCustomItem(parsed.id);
      if (!result.ok) return { result };
      const row = result.data;
      return { result, undo: row && (() => restoreCustomItem(row)) };
    }
    const ref = { planId: plan, key: line.key };
    let result: Awaited<ReturnType<typeof hideLine>>;
    try {
      result = await hideLine(ref);
    } catch {
      result = await hideLine(ref);
    }
    if (!result.ok) return { result };
    const hidden = result.data;
    return {
      result,
      undo:
        hidden &&
        (() => restoreLine({ ...ref, previous: hidden.previous, hiddenUpdatedAt: hidden.hiddenUpdatedAt })),
    };
  }

  async function remove(line: ShoppingLine, moveFocus: boolean) {
    const parsed = parseLineKey(line.key);
    // Without a plan only an own item can be removed (Story 17.10).
    if (parsed === null || (planId === null && parsed.kind !== "custom")) return;
    const plan = planId ?? ownScope;
    const id = entryId(plan, line.key);
    const existing = entries.get(id);
    if (removing.current.has(id) || (existing?.kind === "remove" && !(existing.settled && serverHas(existing, lines)))) {
      return;
    }
    removing.current.add(id);
    try {
      await removeLine(line, plan, id, moveFocus);
    } finally {
      removing.current.delete(id);
    }
  }

  async function removeLine(line: ShoppingLine, plan: string, id: string, moveFocus: boolean) {
    const token = begin("remove", plan, line);
    if (moveFocus) focusAfterRef.current = line.key;
    let removed: Awaited<ReturnType<typeof removeOnServer>>;
    let lost = false;
    try {
      removed = await removeOnServer(line, plan);
    } catch {
      // No answer (e.g. no connection): the line comes back until the list is read again.
      removed = { result: fail("shopping_remove_failed") };
      lost = true;
    }
    if (!removed.result.ok) {
      drop(id, token);
      if (focusAfterRef.current === line.key) focusAfterRef.current = null;
      failed(removed.result, lost);
      return;
    }
    settle(id, token);
    if (!removed.undo) {
      // Gone, but it cannot be put back.
      showOther(removedItemsText([lineName(line)]));
      return;
    }
    confirmRemoved({ line, planId: plan, undo: removed.undo });
  }

  function confirmRemoved(removed: Removed) {
    const all = [...(batch.current?.removed ?? []).filter((other) => other.line.key !== removed.line.key), removed];
    const current = { removed: all };
    batch.current = current;
    const forget = () => {
      if (batch.current === current) batch.current = null;
    };
    showToast(removedItemsText(all.map(({ line }) => lineName(line))), {
      onUndo: () => {
        forget();
        void restoreAll(all);
      },
      onClose: forget,
    });
  }

  async function restoreAll(removed: readonly Removed[]) {
    const results = await Promise.all(
      removed.map(async ({ line, planId: plan, undo }) => {
        const id = entryId(plan, line.key);
        const token = begin("restore", plan, line);
        try {
          const result = await undo();
          if (result.ok) settle(id, token);
          else drop(id, token);
          return { result, lost: false };
        } catch {
          drop(id, token);
          return { result: fail("shopping_restore_failed"), lost: true };
        }
      }),
    );
    const failures = results.flatMap(({ result }, index) => (result.ok ? [] : [{ result, line: removed[index].line }]));
    if (failures.length === 0) return;
    // A plan switched elsewhere says so; otherwise, of several, the alert names the ones not put back.
    const failure = failures.find(({ result }) => !result.ok && result.error.code === "shopping_plan_changed") ?? failures[0];
    const message = removed.length > 1 ? restoreFailedText(failures.map(({ line }) => lineName(line))) : undefined;
    failed(failure.result, results.some(({ lost }) => lost), message);
  }

  // A change the server's list already shows is done, whatever the entry says.
  const scope = planId ?? ownScope;
  const pending = [...entries.values()].filter(
    (entry) => entry.planId === scope && !(entry.settled && serverHas(entry, lines)),
  );
  const shown = pending.length === 0 ? lines : applyRemovals(lines, pending);
  const touched = new Set(pending.map((entry) => entryId(entry.planId, entry.line.key)));
  return { shown, remove: (line, moveFocus) => void remove(line, moveFocus), focusAfterRef, touched };
}

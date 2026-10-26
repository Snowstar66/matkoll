"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { removedItemsText } from "@/features/pantry";
import { fail, type Result } from "@/lib/errors";
import { removeCustomItem } from "../actions/remove-custom-item";
import { restoreCustomItem } from "../actions/restore-custom-item";
import { compareShoppingLines, type ShoppingLine } from "../domain/compute-list";
import type { CustomItemRow } from "../domain/custom-item";
import { parseLineKey } from "../domain/line-key";
import { restoreFailedText } from "../domain/list-text";

// Removing an own item with "Ångra" (FR-17, Story 3.5, AD-20): no question
// first (EXPERIENCE.md, Interaction Primitives). The line leaves the list at
// once and the short confirmation offers "Ångra" for 5 s, which puts the item
// back with the same id, so under the same section and with the same check.
// The same pattern as the pantry (Story 2.3) and the meal plan (Story 3.1).

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

type Removed = { line: ShoppingLine; row: CustomItemRow };

export type CustomItemRemoval = {
  /** `lines` with the removals and "Ångra" not yet in the server's list. */
  shown: readonly ShoppingLine[];
  /**
   * Removes the own item at once; the short confirmation offers "Ångra".
   * `moveFocus` (keyboard): focus goes to the next line afterwards.
   */
  remove: (line: ShoppingLine, moveFocus: boolean) => void;
  /** The key of a line just removed with `moveFocus`, until the list has moved focus. */
  focusAfterRef: RefObject<string | null>;
};

/**
 * Holds the removals of own items for the list of `planId`. A removed line is
 * gone while removeCustomItem runs and stays gone until the server's list no
 * longer has it, so it never flashes back; "Ångra" shows it again until the
 * server's list has it. Items removed while the confirmation shows join it
 * ("diskmedel och Kaffe är borttagna."), and "Ångra" puts them all back. A
 * failed removal brings the line back, and a failed "Ångra" takes it away
 * again, each with a short confirmation announced as an alert; when only
 * some of several could be put back, the alert names the others. A lost
 * answer, or a plan switched elsewhere, reads the list again.
 */
export function useCustomItemRemoval(planId: string | null, lines: readonly ShoppingLine[]): CustomItemRemoval {
  const router = useRouter();
  const { showToast } = useToast();
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());
  const focusAfterRef = useRef<string | null>(null);
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

  async function remove(line: ShoppingLine, moveFocus: boolean) {
    const parsed = parseLineKey(line.key);
    if (planId === null || parsed?.kind !== "custom") return;
    const plan = planId;
    const id = entryId(plan, line.key);
    const token = begin("remove", plan, line);
    if (moveFocus) focusAfterRef.current = line.key;
    let result: Result<CustomItemRow | null>;
    let lost = false;
    try {
      result = await removeCustomItem(parsed.id);
    } catch {
      // No answer (e.g. no connection): the line comes back until the list is read again.
      result = fail("shopping_remove_failed");
      lost = true;
    }
    if (!result.ok) {
      drop(id, token);
      if (focusAfterRef.current === line.key) focusAfterRef.current = null;
      failed(result, lost);
      return;
    }
    settle(id, token);
    if (result.data === null) {
      // Gone, but it cannot be put back.
      showOther(removedItemsText([line.label]));
      return;
    }
    confirmRemoved({ line, row: result.data });
  }

  function confirmRemoved(removed: Removed) {
    const all = [...(batch.current?.removed ?? []).filter((other) => other.line.key !== removed.line.key), removed];
    const current = { removed: all };
    batch.current = current;
    const forget = () => {
      if (batch.current === current) batch.current = null;
    };
    showToast(removedItemsText(all.map(({ line }) => line.label)), {
      onUndo: () => {
        forget();
        void restoreAll(all);
      },
      onClose: forget,
    });
  }

  async function restoreAll(removed: readonly Removed[]) {
    const results = await Promise.all(
      removed.map(async ({ line, row }) => {
        const id = entryId(row.planId, line.key);
        const token = begin("restore", row.planId, line);
        try {
          const result = await restoreCustomItem(row);
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
    const message = removed.length > 1 ? restoreFailedText(failures.map(({ line }) => line.label)) : undefined;
    failed(failure.result, results.some(({ lost }) => lost), message);
  }

  // A change the server's list already shows is done, whatever the entry says.
  const pending =
    planId === null
      ? []
      : [...entries.values()].filter((entry) => entry.planId === planId && !(entry.settled && serverHas(entry, lines)));
  const shown = pending.length === 0 ? lines : applyRemovals(lines, pending);
  return { shown, remove: (line, moveFocus) => void remove(line, moveFocus), focusAfterRef };
}

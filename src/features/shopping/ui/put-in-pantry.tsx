"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/button";
import { useToast } from "@/components/toast";
import { type Result } from "@/lib/errors";
import { putCheckedInPantry, type PutInPantryResult } from "../actions/put-checked-in-pantry";
import type { ShoppingLine } from "../domain/compute-list";
import {
  partlyPutInPantryText,
  putInPantryButtonText,
  putInPantryText,
  serverUnreachableText,
} from "../domain/list-text";
import type { OwnChanges } from "./own-changes";

// "Lägg i lagret" (FR-19, UX-DR9): the list's primary button, pinned above the
// tab bar while a line that can go to the pantry is checked off, with
// "Skicka till ICA" under it (Story 7.3). One tap puts
// every such line in the pantry and takes it off the list, without asking
// first; the short confirmation ("Lagt 8 varor i lagret.") sits above the
// button. A failure is a blue Notice above the list, and trying again adds
// nothing twice.

/** A failed run's notice; a new `id` per failure, so the same text is announced again. */
export type PutInPantryNotice = { text: string; id: number };

/** The codes after which the list is read again: the plan was switched elsewhere. */
const planChanged = new Set(["shopping_plan_changed", "shopping_put_in_pantry_plan_changed"]);

/**
 * Runs putCheckedInPantry for the plan the list shows. `keys` are the lines
 * Pontus checked off when tapping: they are "touched" (`own.track`) until the
 * server's list (`lines`) is read again, so the list's live region does not
 * announce them going as a recount; the confirmation says it. While the flow
 * runs, `pending` is true and another tap does nothing.
 * `shopping_plan_changed`, an expired session and no answer read the list
 * again.
 */
export function usePutInPantry(planId: string | null, lines: readonly ShoppingLine[], own: Pick<OwnChanges, "track">) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const [notice, setNotice] = useState<PutInPantryNotice | null>(null);
  const nextNotice = useRef(0);

  function showNotice(text: string) {
    nextNotice.current += 1;
    setNotice({ text, id: nextNotice.current });
  }

  async function put(keys: readonly string[]) {
    if (planId === null || running.current) return;
    running.current = true;
    setPending(true);
    const before = lines;
    const finishes = keys.map((key) => own.track(planId, key));
    let result: Result<PutInPantryResult> | null;
    try {
      result = await putCheckedInPantry({ planId });
    } catch {
      result = null;
    }
    running.current = false;
    setPending(false);
    // Done once the server's list is read again, whatever it shows then.
    for (const finish of finishes) finish(result?.ok ? (shown) => shown !== before : undefined);
    if (result === null) {
      showNotice(serverUnreachableText);
      router.refresh();
      return;
    }
    if (result.ok) {
      const text = putInPantryText(result.data.added, result.data.removed);
      if (text) showToast(text);
      if (result.data.skipped > 0) showNotice(partlyPutInPantryText);
      else setNotice(null);
      return;
    }
    if (result.error.code === "unauthorized") {
      router.refresh();
      return;
    }
    showNotice(result.error.message);
    if (planChanged.has(result.error.code)) router.refresh();
  }

  return { put, pending, notice };
}

/**
 * "Lägg i lagret" as the primary button; the list puts it in its FixedAction,
 * above "Skicka till ICA" (ListActions). Disabled while the flow or a check's
 * save runs.
 */
export function PutInPantryButton({ disabled, busy, onPut }: { disabled: boolean; busy: boolean; onPut: () => void }) {
  return (
    <Button fullWidth disabled={disabled} aria-busy={busy || undefined} onClick={onPut}>
      {putInPantryButtonText}
    </Button>
  );
}

"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Sheet } from "./sheet";

/** Under every question that is only asked because the delete cannot be undone (Story 19.4). */
export const cannotUndoText = "Det går inte att ångra.";

/**
 * How long after a confirmed removal the next one happens at once, without a
 * question. Only a hook given a `graceKey` uses it (Inköpslistan, Story 13.1
 * as brought back on 2026-11-07).
 */
export const deleteGraceMs = 60_000;

// Where each window started, in memory and per key. A key is one list's own
// window: a removal elsewhere never starts or ends another key's window, so
// the shopping list still asks first when only a pantry item was removed. A
// reload resets it, and that is fine.
const graceStartedAt = new Map<string, number>();

/** Whether the window of `key` is open: a removal now happens without a question. */
export function isDeleteGraceActive(key: string): boolean {
  const at = graceStartedAt.get(key);
  return at !== undefined && Date.now() - at < deleteGraceMs;
}

/** Starts the window of `key` again from now. */
export function startDeleteGrace(key: string): void {
  graceStartedAt.set(key, Date.now());
}

/** Ends every window, so the next removal asks. For tests. */
export function resetDeleteGrace(): void {
  graceStartedAt.clear();
}

export type DeleteRequest = {
  /** The question, e.g. "Ta bort receptet Lasagne?"; it is the sheet's title. */
  question: string;
  /** Deletes; may be async. Called after "Ta bort". */
  onConfirm: () => void | Promise<void>;
  /** Under the question, e.g. what happens to the item. */
  detail?: ReactNode;
  /** The confirm button; "Ta bort" by default. */
  confirmLabel?: string;
  /** The header button that keeps everything; "Avbryt" by default (e.g. "Fortsätt fota"). */
  cancelLabel?: string;
};

export type ConfirmDeleteOptions = {
  /**
   * Makes the question a smart one for something "Ångra" can bring back
   * (Inköpslistan only): the first removal asks, "Ta bort" confirms and opens a
   * 60 s window, and every removal inside it happens at once and restarts the
   * window; "Avbryt" starts nothing. The window belongs to this key alone. The
   * sheet then has no "Det går inte att ångra." line.
   */
  graceKey?: string;
};

/**
 * A question before something that cannot be undone (Story 19.4: recipes, whole
 * meal plans, photos, emptying a place). Anything that "Ångra" can bring back
 * never asks; it deletes at once and says "Tog bort X." with "Ångra". The
 * question is the sheet's title, "Det går inte att ångra." stands under it.
 * Render `dialog` once, and call `requestDelete` from every Ta bort button.
 */
export function useConfirmDelete(options: ConfirmDeleteOptions = {}): { requestDelete: (request: DeleteRequest) => void; dialog: ReactNode } {
  const { graceKey } = options;
  const [asking, setAsking] = useState<DeleteRequest | null>(null);
  // Kept while the sheet closes, so its text does not blank during the animation.
  const [lastAsked, setLastAsked] = useState<DeleteRequest | null>(null);

  // "Ta bort" was pressed: runs once the sheet has closed and given focus back
  // to its opener, so the caller can move focus on (the removed row's bin).
  const confirmed = useRef<DeleteRequest | null>(null);
  useEffect(() => {
    if (asking !== null || confirmed.current === null) return;
    const request = confirmed.current;
    confirmed.current = null;
    void request.onConfirm();
  }, [asking]);

  const requestDelete = useCallback(
    (request: DeleteRequest) => {
      if (graceKey !== undefined && isDeleteGraceActive(graceKey)) {
        startDeleteGrace(graceKey);
        void request.onConfirm();
        return;
      }
      setLastAsked(request);
      setAsking(request);
    },
    [graceKey],
  );

  const shown = asking ?? lastAsked;
  const label = shown?.confirmLabel ?? "Ta bort";
  const dialog = (
    <Sheet
      open={asking !== null}
      onClose={() => setAsking(null)}
      // A question sheet (Story 19.4): the question is the title, the consequence stands under it.
      title={shown?.question ?? label}
      closeLabel={shown?.cancelLabel ?? "Avbryt"}
      initialFocus="close"
      footer={
        <Button
          variant="danger-confirm"
          fullWidth
          onClick={() => {
            if (!asking) return;
            if (graceKey !== undefined) startDeleteGrace(graceKey);
            confirmed.current = asking;
            setAsking(null);
          }}
        >
          {label}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {graceKey === undefined ? <p className="text-body text-ink-2">{cannotUndoText}</p> : null}
        {shown?.detail ? <p className="text-body text-ink-2">{shown.detail}</p> : null}
      </div>
    </Sheet>
  );
  return { requestDelete, dialog };
}

"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Sheet } from "./sheet";

/** Under every question that is only asked because the delete cannot be undone (Story 19.4). */
export const cannotUndoText = "Det går inte att ångra.";

export type DeleteRequest = {
  /** The question, e.g. "Ta bort receptet Lasagne?"; it is the sheet's title. */
  question: string;
  /** Deletes; may be async. Called after "Ta bort". */
  onConfirm: () => void | Promise<void>;
  /** Under the question, e.g. what happens to the item. */
  detail?: ReactNode;
  /** The confirm button; "Ta bort" by default. */
  confirmLabel?: string;
};

/**
 * A question before something that cannot be undone (Story 19.4: recipes, whole
 * meal plans, photos, emptying a place). Anything that "Ångra" can bring back
 * never asks; it deletes at once and says "Tog bort X." with "Ångra". The
 * question is the sheet's title, "Det går inte att ångra." stands under it.
 * Render `dialog` once, and call `requestDelete` from every Ta bort button.
 */
export function useConfirmDelete(): { requestDelete: (request: DeleteRequest) => void; dialog: ReactNode } {
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

  const requestDelete = useCallback((request: DeleteRequest) => {
    setLastAsked(request);
    setAsking(request);
  }, []);

  const shown = asking ?? lastAsked;
  const label = shown?.confirmLabel ?? "Ta bort";
  const dialog = (
    <Sheet
      open={asking !== null}
      onClose={() => setAsking(null)}
      // A question sheet (Story 19.4): the question is the title, the consequence stands under it.
      title={shown?.question ?? label}
      closeLabel="Avbryt"
      initialFocus="close"
      footer={
        <Button
          variant="danger-confirm"
          fullWidth
          onClick={() => {
            if (!asking) return;
            confirmed.current = asking;
            setAsking(null);
          }}
        >
          {label}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-body text-ink-2">{cannotUndoText}</p>
        {shown?.detail ? <p className="text-body text-ink-2">{shown.detail}</p> : null}
      </div>
    </Sheet>
  );
  return { requestDelete, dialog };
}

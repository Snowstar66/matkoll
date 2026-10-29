"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Sheet } from "./sheet";

/**
 * How long after a confirmed delete a trash tap deletes at once, without a
 * question (Story 13.1): a quick second tap shows that Pontus knows what he
 * is doing. Every delete starts the window again.
 */
export const deleteGraceMs = 60_000;

// The start of the window, in memory and shared by every list on the page.
// A reload resets it, and that is fine.
let lastDeleteAt: number | null = null;

/** Whether a trash tap now deletes without a question. */
export function isDeleteGraceActive(): boolean {
  return lastDeleteAt !== null && Date.now() - lastDeleteAt < deleteGraceMs;
}

/** Starts the window again from now. `useConfirmDelete` does this for every delete. */
export function startDeleteGrace(): void {
  lastDeleteAt = Date.now();
}

/** Ends the window, so the next trash tap asks. For tests. */
export function resetDeleteGrace(): void {
  lastDeleteAt = null;
}

export type DeleteRequest = {
  /** The question, e.g. "Ta bort Mjölk från inköpslistan?". */
  question: string;
  /** Deletes; may be async. Called at once inside the grace window, else after "Ta bort". */
  onConfirm: () => void | Promise<void>;
  /** Under the question, e.g. what happens to the item. */
  detail?: ReactNode;
  /** The sheet's title and the confirm button; "Ta bort" by default. */
  confirmLabel?: string;
};

/**
 * A trash tap with a smart question (Story 13.1). `requestDelete` asks first;
 * after a confirmed delete, any request within `deleteGraceMs` deletes at
 * once, and each delete restarts the window. "Avbryt" does not start it.
 * Render `dialog` once, e.g. next to the list, and call `requestDelete` from
 * every trash button.
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
    if (isDeleteGraceActive()) {
      startDeleteGrace();
      void request.onConfirm();
      return;
    }
    setLastAsked(request);
    setAsking(request);
  }, []);

  const shown = asking ?? lastAsked;
  const label = shown?.confirmLabel ?? "Ta bort";
  const dialog = (
    <Sheet
      open={asking !== null}
      onClose={() => setAsking(null)}
      title={label}
      closeLabel="Avbryt"
      initialFocus="close"
      footer={
        <Button
          fullWidth
          onClick={() => {
            if (!asking) return;
            startDeleteGrace();
            confirmed.current = asking;
            setAsking(null);
          }}
        >
          {label}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-body text-ink">{shown?.question}</p>
        {shown?.detail ? <p className="text-body text-ink-2">{shown.detail}</p> : null}
      </div>
    </Sheet>
  );
  return { requestDelete, dialog };
}

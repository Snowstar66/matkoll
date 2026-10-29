"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";

/** After a confirmed removal, the next ones go without a question for this long. */
export const removeGraceMs = 60_000;

/** The question before a dish leaves the plan. */
export function removeDishQuestion(title: string): string {
  return `Ta bort ${title} från matsedeln?`;
}

type Asking = { title: string; remove: () => void };

/**
 * The question before a dish leaves the plan: "Ta bort <rätt> från
 * matsedeln?" with "Ta bort" and "Avbryt". Interim local version of the
 * shared smart confirm (Story 13.1) with the same behaviour: the first
 * removal asks, and every removal within a minute of the last goes at once.
 */
export function useRemoveConfirm(): {
  /** Asks first, or runs `remove` at once inside the grace window. */
  ask: (title: string, remove: () => void) => void;
  /** Render once, anywhere in the component. */
  dialog: ReactNode;
} {
  const [asking, setAsking] = useState<Asking | null>(null);
  const lastAt = useRef(Number.NEGATIVE_INFINITY);
  // The title stays while the sheet closes, so its text does not flash empty.
  const [lastTitle, setLastTitle] = useState("");

  const ask = useCallback((title: string, remove: () => void) => {
    const now = Date.now();
    if (now - lastAt.current < removeGraceMs) {
      lastAt.current = now;
      remove();
      return;
    }
    setLastTitle(title);
    setAsking({ title, remove });
  }, []);

  const dialog = (
    <Sheet
      open={asking !== null}
      onClose={() => setAsking(null)}
      title="Ta bort från matsedeln"
      closeLabel="Avbryt"
      initialFocus="close"
      footer={
        <Button
          fullWidth
          onClick={() => {
            lastAt.current = Date.now();
            const current = asking;
            setAsking(null);
            current?.remove();
          }}
        >
          Ta bort
        </Button>
      }
    >
      <p className="text-body text-ink">{removeDishQuestion(lastTitle)}</p>
    </Sheet>
  );
  return { ask, dialog };
}

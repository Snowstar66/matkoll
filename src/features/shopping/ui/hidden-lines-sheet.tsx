"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { fail, type Result } from "@/lib/errors";
import { showLine } from "../actions/show-line";
import type { ShoppingLine } from "../domain/compute-list";
import { hiddenLinesTitle, lineAmountText, showAgainText } from "../domain/list-text";
import type { OwnChanges } from "./own-changes";

// Dolda varor (Story 3.6): the way back for a hidden recipe line. The sheet
// lists the current plan's hidden lines by name, as they would be counted
// without being hidden, each with "Visa igen", which shows the line on the
// list again with any corrected amount. A hidden line whose key gives no line
// now is not listed.

export type HiddenLinesSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The plan the list was counted for. */
  planId: string;
  /** The hidden lines, sorted like the list. */
  lines: readonly ShoppingLine[];
  /** Tracks the change, so the list's live region does not announce it. */
  onShow: OwnChanges["track"];
};

export function HiddenLinesSheet({ open, onClose, planId, lines, onShow }: HiddenLinesSheetProps) {
  const router = useRouter();
  /** The lines being shown again; their buttons wait. */
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  /** Why showing failed; a new id per failure, so the same text is announced again. */
  const [error, setError] = useState<{ text: string; id: number } | null>(null);

  async function show(line: ShoppingLine) {
    if (busy.has(line.key)) return;
    setBusy((current) => new Set(current).add(line.key));
    setError(null);
    const done = onShow(planId, line.key);
    let result: Result<unknown>;
    try {
      result = await showLine({ planId, key: line.key });
    } catch {
      result = fail("shopping_save_failed");
    }
    setBusy((current) => {
      const next = new Set(current);
      next.delete(line.key);
      return next;
    });
    if (result.ok) {
      // The list is read again with the line on it, and it leaves this sheet.
      done((server) => server.some((other) => other.key === line.key));
      return;
    }
    done();
    if (result.error.code === "unauthorized") {
      router.refresh();
      return;
    }
    setError((before) => ({ text: result.error.message, id: (before?.id ?? 0) + 1 }));
    if (result.error.code === "shopping_plan_changed") router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title={hiddenLinesTitle} closeLabel="Klar">
      <div className="flex flex-col gap-3">
        {error ? (
          <Notice key={error.id} role="alert">
            {error.text}
          </Notice>
        ) : null}
        <ul aria-label={hiddenLinesTitle} className="flex flex-col">
          {lines.map((line) => {
            const amount = lineAmountText(line);
            return (
              <li
                key={line.key}
                data-testid="hidden-line"
                className="flex min-h-tap items-center gap-3 border-b border-hairline py-1 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body text-ink">{line.label}</span>
                  {amount ? <span className="text-meta text-ink-2"> {amount}</span> : null}
                </span>
                <Button
                  variant="text"
                  aria-label={`${showAgainText} ${line.label}`}
                  disabled={busy.has(line.key)}
                  onClick={() => void show(line)}
                  className="-mr-3 shrink-0"
                >
                  {showAgainText}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

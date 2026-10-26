"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import type { Location } from "@/features/catalog";
import { newId } from "@/lib/new-id";
import type { PantryItem } from "../domain/pantry-item";
import { emptyPlaceButtonText, emptyPlaceQuestion, emptyPlaceUndoHint } from "../domain/places";
import { usePantryRemoval } from "./pantry-removal";
import { usePantrySuggestions } from "./pantry-suggestions";

// "Töm kylen" (Story 6.3): a text button under the list, only while the
// location has items, and unavailable while a removal or "Ångra" there is on
// its way. It asks first in a sheet ("Ta bort alla 14 varor i kylen?", focus
// on "Avbryt"), although emptying can be undone, since many items go at
// once. The sheet's "Töm kylen" waits for the server ("Tar bort …", the sheet
// cannot be closed meanwhile), so a failure shows in the sheet with nothing
// removed; trying again sends the same operation id, so an emptying whose
// answer was lost is never repeated. Afterwards the short confirmation has
// "Ångra" (PantryRemovalProvider), and focus goes to the camera button: the
// next step is a new photo. The sheet closes when the location has no items
// left while it asks.

export type EmptyPlaceButtonProps = {
  /** The place Hemma shows (Story 8.2): what is pending and emptied is kept per place. */
  siteId: string;
  location: Location;
  /** The number of items shown, as the location card counts them; no button for 0. */
  count: number;
  /** The items shown, for their names when "Ångra" puts them back. */
  items: readonly PantryItem[];
};

export function EmptyPlaceButton({ siteId, location, count, items }: EmptyPlaceButtonProps) {
  const { emptyPlace, isPending } = usePantryRemoval();
  const { cameraButtonRef } = usePantrySuggestions();
  /** The open sheet's operation id, kept for "Försök igen"; `null` while it is closed. */
  const [operationId, setOperationId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set from the tap until the answer, before React has rendered `emptying`. */
  const inFlight = useRef(false);
  /** Increases when the location is emptied, so the camera button can take focus. */
  const [emptied, setEmptied] = useState(0);
  const text = emptyPlaceButtonText(location);
  const pending = isPending(siteId, location);

  // Nothing left to ask about (emptied elsewhere, or by an answer that was lost): the sheet closes.
  if (operationId !== null && count === 0 && !emptying) setOperationId(null);

  // After the commit that closed the sheet, whose own focus return runs first.
  useEffect(() => {
    if (emptied > 0) cameraButtonRef.current?.focus();
  }, [emptied, cameraButtonRef]);

  function ask() {
    setError(null);
    setOperationId(newId());
  }

  async function confirm() {
    if (inFlight.current || operationId === null) return;
    inFlight.current = true;
    setEmptying(true);
    setError(null);
    try {
      const result = await emptyPlace(siteId, location, items, operationId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOperationId(null);
      setEmptied((times) => times + 1);
    } finally {
      inFlight.current = false;
      setEmptying(false);
    }
  }

  return (
    <>
      {count > 0 ? (
        <Button variant="text" disabled={pending} onClick={ask} className="-ml-3 self-start">
          {text}
        </Button>
      ) : null}
      <Sheet
        open={operationId !== null}
        onClose={() => setOperationId(null)}
        title={text}
        closeLabel="Avbryt"
        initialFocus="close"
        preventClose={emptying}
        footer={
          <>
            {error ? <Notice role="alert">{error}</Notice> : null}
            <Button fullWidth disabled={emptying || pending} onClick={() => void confirm()}>
              {emptying ? "Tar bort …" : text}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="text-body text-ink">{emptyPlaceQuestion(location, count)}</p>
          <p className="text-body text-ink-2">{emptyPlaceUndoHint}</p>
        </div>
      </Sheet>
    </>
  );
}

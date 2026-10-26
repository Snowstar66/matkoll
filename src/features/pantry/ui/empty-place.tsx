"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import type { Location } from "@/features/catalog";
import { newId } from "@/lib/new-id";
import type { PantryItem } from "../domain/pantry-item";
import { emptyPlaceButtonText, emptyPlaceQuestion, emptyPlaceUndoHint } from "../domain/places";
import type { SelectedSite } from "../domain/site";
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
//
// Places (Story 8.4, FR-33): the sheet keeps what it asked about when it
// opened (the place, the location, the items and their number) with its
// operation id, empties only that place's location, and closes when Hemma
// shows another.
// With more than one place the question and the confirmation name it: "Ta
// bort alla 14 varor i kylen för Stugan?"

export type EmptyPlaceButtonProps = {
  /**
   * The place Hemma shows (Story 8.2): what is pending and emptied is kept
   * per place, and the sheet empties the place it opened for (Story 8.4).
   */
  site: SelectedSite;
  location: Location;
  /** The number of items shown, as the location card counts them; no button for 0. */
  count: number;
  /** The items shown, for their names when "Ångra" puts them back. */
  items: readonly PantryItem[];
};

/**
 * What the open sheet asks about, as it was when it opened (Story 8.4): the
 * place, the location, the items and their number, and the operation id, so
 * the question, "Ångra" and "Försök igen" all keep to them.
 */
type Asking = {
  site: SelectedSite;
  location: Location;
  items: readonly PantryItem[];
  count: number;
  operationId: string;
};

export function EmptyPlaceButton({ site, location, count, items }: EmptyPlaceButtonProps) {
  const { emptyPlace, isPending } = usePantryRemoval();
  const { cameraButtonRef } = usePantrySuggestions();
  /** What the open sheet asks about; `null` while it is closed. */
  const [asking, setAsking] = useState<Asking | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set from the tap until the answer, before React has rendered `emptying`. */
  const inFlight = useRef(false);
  /** Increases when the location is emptied, so the camera button can take focus. */
  const [emptied, setEmptied] = useState(0);
  const text = emptyPlaceButtonText(asking?.location ?? location);
  const pending = isPending(asking?.site.id ?? site.id, asking?.location ?? location);

  // The sheet closes when Hemma shows another place or location than the one
  // it asks about, and when that location has nothing left (emptied
  // elsewhere, or by an answer that was lost).
  if (
    asking !== null &&
    !emptying &&
    (asking.site.id !== site.id || asking.location !== location || count === 0)
  ) {
    setAsking(null);
  }

  // After the commit that closed the sheet, whose own focus return runs first.
  useEffect(() => {
    if (emptied > 0) cameraButtonRef.current?.focus();
  }, [emptied, cameraButtonRef]);

  function ask() {
    setError(null);
    // Kept with the operation id, so "Försök igen" empties the same place and location.
    setAsking({ site, location, items, count, operationId: newId() });
  }

  async function confirm() {
    if (inFlight.current || asking === null) return;
    inFlight.current = true;
    setEmptying(true);
    setError(null);
    try {
      const result = await emptyPlace(asking.site, asking.location, asking.items, asking.operationId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setAsking(null);
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
        open={asking !== null}
        onClose={() => setAsking(null)}
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
          <p className="text-body text-ink">{asking ? emptyPlaceQuestion(asking.location, asking.count, asking.site) : null}</p>
          <p className="text-body text-ink-2">{emptyPlaceUndoHint}</p>
        </div>
      </Sheet>
    </>
  );
}

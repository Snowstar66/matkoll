"use client";

import { useRef, useState } from "react";
import { formatQuantity, LOCATIONS, type Location } from "@/features/catalog";
import { FilterPills } from "@/components/filter-pills";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { fail, type Result } from "@/lib/errors";
import { moveUnpackedItem } from "../actions/move-unpacked-item";
import type { PlacedItem } from "../domain/put-in-pantry";

// "Packa upp kassarna" (Story 16.18): the sheet "Ändra" opens after "Lägg till i Matvaror". Every
// item that went to the pantry is a row with its three places; one tap on another place moves
// it there at once, with no save step (so the button is "Klar", nothing can be lost). The order
// of the rows never changes, so a row does not jump away from under the thumb.

export type UnpackSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The items "Lägg till i Matvaror" put in the pantry, with the place each went to. */
  items: readonly PlacedItem[];
  /** The place they went to. */
  siteId: string;
  /** Called after a move that found the place gone, so the page is read again. */
  onSiteGone?: () => void;
};

/** The sheet is mounted fresh per run (`key`), so its places start from what each item got. */
export function UnpackSheet({ open, onClose, items, siteId, onSiteGone }: UnpackSheetProps) {
  const [places, setPlaces] = useState<readonly Location[]>(() => items.map((item) => item.location));
  const placesRef = useRef(places);
  const [busy, setBusy] = useState<ReadonlySet<number>>(() => new Set());
  const [error, setError] = useState<{ text: string; id: number } | null>(null);

  function setPlace(index: number, place: Location) {
    const next = placesRef.current.map((each, at) => (at === index ? place : each));
    placesRef.current = next;
    setPlaces(next);
  }

  async function move(index: number, to: Location) {
    const item = items[index];
    const from = placesRef.current[index];
    if (!item || !from || from === to || busy.has(index)) return;
    setPlace(index, to);
    setBusy((current) => new Set(current).add(index));
    setError(null);
    let result: Result<null>;
    try {
      result = await moveUnpackedItem({
        siteId,
        ingredientId: item.ingredientId,
        amount: item.amount,
        unit: item.unit,
        from,
        to,
      });
    } catch {
      result = fail("pantry_move_failed");
    }
    setBusy((current) => {
      const next = new Set(current);
      next.delete(index);
      return next;
    });
    if (result.ok) return;
    // It stays where it was, and the row shows that.
    setPlace(index, from);
    setError((before) => ({ text: result.error.message, id: (before?.id ?? 0) + 1 }));
    if (result.error.code === "pantry_site_gone") onSiteGone?.();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Packa upp"
      subtitle="Tryck på rätt plats för varje vara."
      closeLabel="Klar"
    >
      <div className="flex flex-col gap-4 pt-2">
        {error ? (
          <Notice key={error.id} role="alert">
            {error.text}
          </Notice>
        ) : null}
        <ul aria-label="Varor att packa upp" className="flex flex-col">
          {items.map((item, index) => {
            const amount = formatQuantity(item.amount, item.unit);
            return (
              <li
                key={`${item.ingredientId}:${item.unit ?? ""}`}
                data-testid="unpack-item"
                className="flex flex-col gap-2 border-b border-hairline py-3 first:pt-0 last:border-b-0"
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-body font-medium text-ink">{item.name}</span>
                  {amount ? <span className="text-meta text-ink-2">{amount}</span> : null}
                </span>
                <FilterPills
                  label={`Plats för ${item.name}`}
                  segmented
                  tall
                  options={LOCATIONS.map((location) => ({ value: location, label: location }))}
                  value={places[index] ?? item.location}
                  onChange={(place) => void move(index, place)}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

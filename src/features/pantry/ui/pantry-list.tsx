"use client";

import { useId } from "react";
import { EmptyState } from "@/components/empty-state";
import { formatQuantity, type Location } from "@/features/catalog";
import { splitPantryItems, type PantryItem } from "../domain/pantry-item";
import { emptyPlaceText } from "../domain/places";
import { AddPantryItemButton, usePantrySheet } from "./pantry-item-sheet";

export type PantryListProps = {
  location: Location;
  /** The location's items, in the order to show them (listPantry sorts by name). */
  items: readonly PantryItem[];
};

/**
 * One location's items: under "Med mängd" a row per item with the amount to
 * the right, under "Finns hemma" a round mint tag per unlimited item
 * (DESIGN.md, pantry-tag). A section without items is left out; a location
 * without items shows "Inget i kylen än." (or frysen, skafferiet) and "Lägg
 * till vara". A tap on a row or tag opens the sheet Lagervara for the item
 * (needs a PantrySheetProvider above).
 */
export function PantryList({ location, items }: PantryListProps) {
  const withAmountId = useId();
  const unlimitedId = useId();
  const { openItem } = usePantrySheet();
  if (items.length === 0) {
    return <EmptyState action={<AddPantryItemButton variant="primary" />}>{emptyPlaceText(location)}</EmptyState>;
  }
  const { withAmount, unlimited } = splitPantryItems(items);
  return (
    <div className="flex flex-col gap-6">
      {withAmount.length > 0 ? (
        <section aria-labelledby={withAmountId} className="flex flex-col gap-2">
          <h2 id={withAmountId} className="text-section-label text-ink-2">
            Med mängd
          </h2>
          <ul aria-labelledby={withAmountId} className="flex flex-col rounded-lg bg-surface px-4">
            {withAmount.map((item) => (
              <li key={item.id} data-testid="pantry-row" className="border-t border-hairline first:border-t-0">
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="flex min-h-tap w-full items-center justify-between gap-3 rounded-sm py-2 text-left"
                >
                  <span className="min-w-0 text-body text-ink">{item.name}</span>{" "}
                  <span className="shrink-0 text-body text-ink-2">{formatQuantity(item.amount, item.unit)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {unlimited.length > 0 ? (
        <section aria-labelledby={unlimitedId} className="flex flex-col gap-2">
          <h2 id={unlimitedId} className="text-section-label text-ink-2">
            Finns hemma
          </h2>
          <ul aria-labelledby={unlimitedId} className="flex flex-wrap gap-2">
            {unlimited.map((item) => (
              <li key={item.id} data-testid="pantry-tag">
                {/* 44 px tap area around the visible pill (DESIGN.md, pantry-tag). */}
                <button type="button" onClick={() => openItem(item)} className="flex min-h-tap items-center rounded-full">
                  <span className="rounded-full bg-mint px-[14px] py-2 text-meta font-semibold text-mint-ink">
                    {item.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

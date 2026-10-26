"use client";

import { useEffect, useId, useRef } from "react";
import { EmptyState } from "@/components/empty-state";
import { SwipeRow } from "@/components/swipe-row";
import { formatQuantity, type Location } from "@/features/catalog";
import { splitPantryItems, type PantryItem } from "../domain/pantry-item";
import { emptyPlaceText } from "../domain/places";
import { AddPantryItemButton, usePantrySheet } from "./pantry-item-sheet";
import { usePantryRemoval } from "./pantry-removal";

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
 * (needs a PantrySheetProvider above). Swiping a row to the left reveals "Ta
 * bort" (Story 2.3), also reached with Tab after the row; an unlimited item is
 * removed in the sheet. After a removal with the keyboard or in the sheet,
 * focus goes to the next item, else the one before, else "Lägg till vara".
 */
export function PantryList({ location, items }: PantryListProps) {
  const withAmountId = useId();
  const unlimitedId = useId();
  const { openItem } = usePantrySheet();
  const { removeItem, focusAfter, focusMoved } = usePantryRemoval();
  const rootRef = useRef<HTMLDivElement>(null);
  const { withAmount, unlimited } = splitPantryItems(items);
  // The items in the order focus moves through them: rows, then tags.
  const order = [...withAmount, ...unlimited].map((item) => item.id);
  const lastOrder = useRef<readonly string[]>(order);

  useEffect(() => {
    if (focusAfter !== null && !order.includes(focusAfter)) {
      const before = lastOrder.current;
      const index = before.indexOf(focusAfter);
      const neighbours = index === -1 ? [] : [...before.slice(index + 1), ...before.slice(0, index).reverse()];
      const target = neighbours.find((id) => order.includes(id));
      const root = rootRef.current;
      const element = target
        ? root?.querySelector<HTMLElement>(`[data-pantry-item="${target}"]`)
        : root?.querySelector<HTMLElement>("button");
      element?.focus();
      focusMoved();
    }
    lastOrder.current = order;
  });

  if (items.length === 0) {
    return (
      <div ref={rootRef}>
        <EmptyState action={<AddPantryItemButton variant="primary" />}>{emptyPlaceText(location)}</EmptyState>
      </div>
    );
  }
  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      {withAmount.length > 0 ? (
        <section aria-labelledby={withAmountId} className="flex flex-col gap-2">
          <h2 id={withAmountId} className="text-section-label text-ink-2">
            Med mängd
          </h2>
          <ul aria-labelledby={withAmountId} className="flex flex-col overflow-hidden rounded-lg bg-surface">
            {withAmount.map((item) => (
              <li key={item.id} className="group">
                <SwipeRow
                  actionLabel="Ta bort"
                  actionName={`Ta bort ${item.name}`}
                  onAction={(via) => removeItem(item, { moveFocus: via === "keyboard" })}
                >
                  {/* The divider is inset like the card's padding, and moves with the row. */}
                  <div className="px-4">
                    <button
                      type="button"
                      data-testid="pantry-row"
                      data-pantry-item={item.id}
                      onClick={() => openItem(item)}
                      className="flex min-h-tap w-full items-center justify-between gap-3 border-t border-hairline py-2 text-left group-first:border-t-0"
                    >
                      <span className="min-w-0 text-body text-ink">{item.name}</span>{" "}
                      <span className="shrink-0 text-body text-ink-2">{formatQuantity(item.amount, item.unit)}</span>
                    </button>
                  </div>
                </SwipeRow>
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
                <button
                  type="button"
                  data-pantry-item={item.id}
                  onClick={() => openItem(item)}
                  className="flex min-h-tap items-center rounded-full"
                >
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

"use client";

import { useEffect } from "react";
import type { Location } from "@/features/catalog";
import type { PantryItem } from "../domain/pantry-item";
import { LocationCards } from "./location-cards";
import { PantryList } from "./pantry-list";
import { applyPantryChanges, usePantryRemoval } from "./pantry-removal";

export type PantryPlaceProps = {
  /** The chosen location. */
  location: Location;
  /** The number of items in each location, as read. */
  counts: Record<Location, number>;
  /** The chosen location's items, sorted (listPantry). */
  items: readonly PantryItem[];
};

/**
 * Hemma's location cards and the chosen location's items, with removals and
 * "Ångra" that the server's items do not show yet already applied
 * (usePantryRemoval). The chosen card counts the items shown, so card and
 * list never disagree.
 */
export function PantryPlace({ location, counts, items }: PantryPlaceProps) {
  const { changes, report } = usePantryRemoval();
  // The removals keep a change until the server's items show it.
  useEffect(() => report(location, items), [report, location, items]);
  const shown = applyPantryChanges(items, location, changes);
  return (
    <div className="flex flex-col gap-6">
      <LocationCards selected={location} counts={{ ...counts, [location]: shown.length }} />
      <PantryList location={location} items={shown} />
    </div>
  );
}

"use client";

import { useEffect } from "react";
import type { Location } from "@/features/catalog";
import type { PantryItem } from "../domain/pantry-item";
import type { SelectedSite } from "../domain/site";
import { AddSiteButton } from "./add-site-button";
import { EmptyPlaceButton } from "./empty-place";
import { LocationCards } from "./location-cards";
import { PantryCamera } from "./pantry-camera";
import { PantryList } from "./pantry-list";
import { applyPantryChanges, usePantryRemoval } from "./pantry-removal";
import { PantrySuggestionList } from "./pantry-suggestion-list";

export type PantryPlaceProps = {
  /** The place Hemma shows: the selected one (Story 8.2). */
  site: SelectedSite;
  /** The chosen location. */
  location: Location;
  /** The number of items in each location of the place, as read. */
  counts: Record<Location, number>;
  /** The chosen location's items on the place, sorted (listPantry). */
  items: readonly PantryItem[];
};

/**
 * Hemma's location cards, the camera button and the suggestions from the
 * latest photo (needs a PantrySuggestionsProvider above), and the chosen
 * location's items on the place, with removals and "Ångra" that the server's
 * items do not show yet already applied (usePantryRemoval), and "Töm kylen"
 * under them while there are any. The chosen card counts the items shown, so
 * card, list and the question in "Töm kylen" never disagree. While Pontus has
 * only one place, "Lägg till ställe" comes last (needs a SiteSwitch above);
 * with more, the site switch above has "Ställen".
 */
export function PantryPlace({ site, location, counts, items }: PantryPlaceProps) {
  const { changes, report } = usePantryRemoval();
  // The removals keep a change until the server's items show it.
  useEffect(() => report(site.id, location, items), [report, site.id, location, items]);
  const shown = applyPantryChanges(items, site.id, location, changes);
  return (
    <div className="flex flex-col gap-6">
      <LocationCards selected={location} counts={{ ...counts, [location]: shown.length }} />
      <PantryCamera location={location} />
      <PantrySuggestionList />
      <PantryList location={location} items={shown} />
      <EmptyPlaceButton siteId={site.id} location={location} count={shown.length} items={shown} />
      {site.siteCount === 1 ? <AddSiteButton /> : null}
    </div>
  );
}

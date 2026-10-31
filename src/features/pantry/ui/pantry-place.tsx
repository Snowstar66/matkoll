"use client";

import { useEffect } from "react";
import type { Location } from "@/features/catalog";
import type { PantryItem } from "../domain/pantry-item";
import type { SelectedSite } from "../domain/site";
import { AddSiteButton } from "./add-site-button";
import { EmptyPlaceButton } from "./empty-place";
import { LatestPhoto, type ShownPlacePhoto } from "./latest-photo";
import { LocationCards } from "./location-cards";
import { PantryCamera } from "./pantry-camera";
import { PantryList } from "./pantry-list";
import { applyPantryChanges, usePantryRemoval } from "./pantry-removal";
import { PantrySuggestionList } from "./pantry-suggestion-list";
import { usePantrySuggestions } from "./pantry-suggestions";

export type PantryPlaceProps = {
  /** The place Hemma shows: the selected one (Story 8.2). */
  site: SelectedSite;
  /** The chosen location. */
  location: Location;
  /** The number of items in each location of the place, as read. */
  counts: Record<Location, number>;
  /** The chosen location's items on the place, sorted (listPantry). */
  items: readonly PantryItem[];
  /** Story 10.2: the latest photo of the chosen location on the place, or `null` for none. */
  photo?: ShownPlacePhoto | null;
};

/**
 * Lagersaldo's location cards, the camera button with the line "Senaste
 * foto" under it (Story 10.2), the suggestions from the latest photo (needs a
 * PantrySuggestionsProvider above), and the chosen location's items on the
 * place (with "Sök i kylen", Story 11.3), with removals and "Ångra" that the server's
 * items do not show yet already applied (usePantryRemoval), and "Töm kylen"
 * under them while there are any and no search is on. The chosen card counts the items shown, so
 * card, list and the question in "Töm kylen" never disagree. While Pontus has
 * only one place, "Lägg till ställe" comes last (needs a SiteSwitch above);
 * with more, the site switch above has "Ställen".
 */
export function PantryPlace({ site, location, counts, items, photo = null }: PantryPlaceProps) {
  const { changes, report } = usePantryRemoval();
  const { readyLocations } = usePantrySuggestions();
  // The removals keep a change until the server's items show it.
  useEffect(() => report(site.id, location, items), [report, site.id, location, items]);
  const shown = applyPantryChanges(items, site.id, location, changes);
  return (
    <div className="flex flex-col gap-3">
      <LocationCards selected={location} counts={{ ...counts, [location]: shown.length }} ready={readyLocations(site.id)} />
      <PantryCamera site={site} location={location}>
        <LatestPhoto photo={photo} location={location} />
      </PantryCamera>
      <PantrySuggestionList siteId={site.id} />
      {/* Keyed, so the search starts empty on another place or location (Story 11.3). */}
      <PantryList
        key={`${site.id}:${location}`}
        location={location}
        items={shown}
        // "Töm kylen" acts on the whole location, so it hides while a search shows only matches.
        after={<EmptyPlaceButton site={site} location={location} count={shown.length} items={shown} />}
      />
      {site.siteCount === 1 ? <AddSiteButton /> : null}
    </div>
  );
}

"use client";

import type { Ref, RefObject } from "react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { SearchField, type SearchFieldHandle } from "@/components/search-field";
import type { Location } from "@/features/catalog";
import { noMatchText, pantrySearchLabel } from "../domain/pantry-meta";

// Sök i platsen (Story 11.3, FR-41, EXPERIENCE.md): a search field at the top
// of Lagersaldo's list while the location has items. It filters the items
// already on the page by name and brand as Pontus types, without a pause.
// The search is state in the list, which Lagersaldo keys on the place and the
// location: choosing another one empties it, while React Activity keeps it
// when Pontus goes to another tab and back.

/** The longest search: far longer than any name and brand. */
export const maxPantrySearchChars = 100;

export type PantrySearchFieldProps = {
  location: Location;
  /** The search that filters the list now; a field shown again (after the list was empty) shows it. */
  query: string;
  onQueryChange: (query: string) => void;
  /** For "Rensa sökning" in PantryNoMatch. */
  fieldRef?: Ref<SearchFieldHandle>;
};

/** "Sök i kylen" (frysen, skafferiet): the name and the placeholder follow the location. */
export function PantrySearchField({ location, query, onQueryChange, fieldRef }: PantrySearchFieldProps) {
  const label = pantrySearchLabel(location);
  return (
    <SearchField
      ref={fieldRef}
      label={label}
      placeholder={label}
      defaultValue={query}
      delayMs={0}
      onSearch={onQueryChange}
      maxLength={maxPantrySearchChars}
    />
  );
}

export type PantryNoMatchProps = {
  location: Location;
  /** The search field, which "Rensa sökning" empties and puts focus in. */
  fieldRef: RefObject<SearchFieldHandle | null>;
};

/** No item matches: "Inget i kylen matchar." and "Rensa sökning", which empties the field and puts focus in it. */
export function PantryNoMatch({ location, fieldRef }: PantryNoMatchProps) {
  return (
    <EmptyState
      action={
        <Button variant="text" onClick={() => fieldRef.current?.clear()}>
          Rensa sökning
        </Button>
      }
    >
      {noMatchText(location)}
    </EmptyState>
  );
}

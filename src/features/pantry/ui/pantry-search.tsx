"use client";

import { type Ref, type RefObject, useEffect, useState } from "react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { SearchField, type SearchFieldHandle } from "@/components/search-field";
import type { Location } from "@/features/catalog";
import { noMatchText, pantrySearchLabel } from "../domain/pantry-meta";

// Sök i platsen (Story 11.3, FR-41, EXPERIENCE.md): a search field at the top
// of Förråd's list while the location has items. It filters the items
// already on the page by name and brand as Pontus types, without a pause.
// The search is state in the list, which Förråd keys on the place and the
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
  /** Nothing matches: the field leaves out its own "Rensa sökning", so the page has one control by that name. */
  noMatch?: boolean;
};

/** "Sök i kylen" (frysen, skafferiet): the name and the placeholder follow the location. */
export function PantrySearchField({ location, query, onQueryChange, fieldRef, noMatch = false }: PantrySearchFieldProps) {
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
      clearable={!noMatch}
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

/** How long the search rests before its result is announced, so not every keystroke is read out. */
export const searchStatusDelayMs = 500;

/** "1 träff", "3 träffar", or "Inget i kylen matchar."; nothing without a search. */
export function searchStatusText(location: Location, query: string, count: number): string {
  if (query.trim() === "") return "";
  if (count === 0) return noMatchText(location);
  return `${count} ${count === 1 ? "träff" : "träffar"}`;
}

/**
 * A polite live region, hidden from sight, that says how many items match
 * ("3 träffar", "Inget i kylen matchar.") once the search has rested for
 * searchStatusDelayMs. The list itself filters at once.
 */
export function PantrySearchStatus({ location, query, count }: { location: Location; query: string; count: number }) {
  const text = searchStatusText(location, query, count);
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(text), text === "" ? 0 : searchStatusDelayMs);
    return () => clearTimeout(timer);
  }, [text]);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="pantry-search-status">
      {announced}
    </div>
  );
}

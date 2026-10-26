"use client";

import { useEffect, useId, useRef } from "react";
import { Badge } from "@/components/badges";
import {
  currentAmountText,
  suggestionAmountText,
  suggestionsArrivedText,
  suggestionsHeading,
  type PantrySuggestion,
} from "../domain/pantry-suggestion";
import { usePantrySuggestions } from "./pantry-suggestions";
import { focusIsFree } from "./use-pantry-analysis";

// Lagerförslag (FR-24, DESIGN.md Lagerförslag): the suggestions from the
// latest photo, under the camera button, in a section headed "Lagerförslag
// från kylen" after the photographed place, which may not be the chosen
// card. Each card, like a recipe row, shows the name, the amount ("1 förp",
// "Finns hemma") and the place, "Ny" when the catalog ingredient will be
// created, and what the place has now ("I kylen nu: 2 förp"), since
// confirming sets the amount exactly. Confirm, correct and reject come with
// Story 6.2. Nothing here is saved.

export function PantrySuggestionList() {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { result, arrivals, announce, cameraAreaRef } = usePantrySuggestions();
  // What this mount has already moved focus for: a remount (another location
  // card) does not take focus for suggestions that came earlier.
  const handledArrivals = useRef(arrivals);

  // New suggestions: focus on the heading, so they are read out from the
  // start, while focus is still in the camera area (or nowhere). When Pontus
  // has moved on, e.g. into the sheet Lagervara, focus stays, and the camera's
  // live region says that they came.
  useEffect(() => {
    if (arrivals === handledArrivals.current) return;
    handledArrivals.current = arrivals;
    if (focusIsFree(cameraAreaRef.current)) headingRef.current?.focus();
    else if (result) announce(suggestionsArrivedText(result.location, result.suggestions.length));
  }, [arrivals, result, announce, cameraAreaRef]);

  if (!result || result.suggestions.length === 0) return null;
  return (
    <section aria-labelledby={headingId} data-testid="pantry-suggestions" className="flex flex-col gap-3">
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-section-label text-ink-2">
        {suggestionsHeading(result.location)}
      </h2>
      <ul className="flex flex-col gap-3">
        {result.suggestions.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} />
        ))}
      </ul>
    </section>
  );
}

function SuggestionCard({ suggestion }: { suggestion: PantrySuggestion }) {
  const { name, ingredient, location, current } = suggestion;
  return (
    <li data-testid="pantry-suggestion" className="flex flex-col gap-1 rounded-lg bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-row-title break-words text-ink">{name}</h3>
        {ingredient.kind === "new" ? (
          <Badge tone="neutral" className="shrink-0">
            Ny
          </Badge>
        ) : null}
      </div>
      <p className="text-body text-ink-2">
        <span>{suggestionAmountText(suggestion)}</span> · <span>{location}</span>
      </p>
      {current ? <p className="text-meta text-ink-2">{currentAmountText(location, current)}</p> : null}
    </li>
  );
}

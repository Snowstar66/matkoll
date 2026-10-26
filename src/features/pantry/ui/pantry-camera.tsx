"use client";

import { type ChangeEvent, useEffect, useRef } from "react";
import { Button } from "@/components/button";
import { CameraIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import type { Location } from "@/features/catalog";
import {
  allUnchangedText,
  analyzeErrorMessage,
  cameraButtonText,
  noSuggestionsText,
  partlyUnchangedText,
  unreadableItemsText,
} from "../domain/pantry-suggestion";
import { AddPantryItemButton } from "./pantry-item-sheet";
import { usePantrySuggestions } from "./pantry-suggestions";
import { focusIsFree } from "./use-pantry-analysis";

// Kameraknappen (FR-24, UX-DR10, DESIGN.md camera-button): a light blue
// button across the width under the location cards, "Fotografera kylen"
// (frysen, skafferiet) after the chosen location. On a phone it opens the
// back camera and "Välj bild" under it opens the photo library; on a desktop
// it opens the file picker (EXPERIENCE.md, Responsive). No camera API beyond
// the file input. While a photo is analysed, "Tittar på bilden …" with a
// progress bar and "Avbryt" take its place. Errors and an empty answer show
// in a notice at the top of this area ("Allt i kylen stämmer med bilden."
// when a photo matches the place, Story 6.4), and the camera button takes focus back
// (unless Pontus has moved on, e.g. into the sheet); the rest of Hemma keeps
// working.

export type PantryCameraProps = {
  /** The chosen location: the button's text and the place a new photo shows. */
  location: Location;
};

export function PantryCamera({ location }: PantryCameraProps) {
  const {
    analyzing,
    result,
    error,
    empty,
    canRetry,
    cancels,
    settles,
    announcement,
    cameraAreaRef,
    cameraButtonRef,
    flushFocus,
    analyze,
    retry,
    cancel,
  } = usePantrySuggestions();
  const touch = useCoarsePointer();
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  // What this mount has already moved focus for: a remount (another location
  // card) does not take focus for an "Avbryt" that came earlier.
  const handledCancels = useRef(cancels);
  const handledSettles = useRef(settles);

  // Mounted anew (another location card): a focus move the lagerförslag asked for meanwhile happens now.
  useEffect(() => flushFocus(), [flushFocus]);

  // "Avbryt": the camera button is back, with focus.
  useEffect(() => {
    if (cancels === handledCancels.current) return;
    handledCancels.current = cancels;
    cameraButtonRef.current?.focus();
  }, [cancels, cameraButtonRef]);

  // An error or no suggestions: the camera button is back, with focus, while focus has nowhere else to be.
  useEffect(() => {
    if (settles === handledSettles.current) return;
    handledSettles.current = settles;
    if (focusIsFree(cameraAreaRef.current)) cameraButtonRef.current?.focus();
  }, [settles, cameraAreaRef, cameraButtonRef]);

  /** The chosen file; the field is emptied so the same photo can be chosen again. */
  function onChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) analyze(file, location);
  }

  let notice = null;
  if (!analyzing && error) {
    notice = (
      <Notice
        role="alert"
        action={
          canRetry ? (
            <Button variant="text" onClick={retry}>
              Försök igen
            </Button>
          ) : undefined
        }
      >
        {analyzeErrorMessage(error)}
      </Notice>
    );
  } else if (!analyzing && (empty === "unchanged" || empty === "partlyUnchanged") && result) {
    // Story 6.4: every suggestion matches the place, and nothing is missing; "Allt …" only for a complete comparison.
    notice = (
      <Notice role="status">
        {empty === "unchanged" ? allUnchangedText(result.location) : partlyUnchangedText(result.location)}
      </Notice>
    );
  } else if (!analyzing && empty) {
    notice = (
      <Notice role="status" action={<AddPantryItemButton variant="text" />}>
        {empty === "unreadable" ? unreadableItemsText : noSuggestionsText}
      </Notice>
    );
  }

  return (
    <div ref={cameraAreaRef} data-testid="pantry-camera" className="flex flex-col gap-3">
      {notice}
      {/* Mounted empty, so the text is announced when it appears. */}
      <div role="status">
        {analyzing ? <Looking /> : announcement ? <span className="sr-only">{announcement}</span> : null}
      </div>
      {analyzing ? (
        <Button variant="text" onClick={cancel} className="-ml-3 self-start">
          Avbryt
        </Button>
      ) : (
        <>
          <Button
            ref={cameraButtonRef}
            variant="secondary"
            fullWidth
            onClick={() => (touch ? cameraRef : pickerRef).current?.click()}
          >
            <CameraIcon size={22} />
            {cameraButtonText(location)}
          </Button>
          {touch ? (
            <Button variant="text" onClick={() => pickerRef.current?.click()} className="self-center">
              Välj bild
            </Button>
          ) : null}
        </>
      )}
      {touch ? (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={onChosen}
        />
      ) : null}
      <input
        ref={pickerRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={onChosen}
      />
    </div>
  );
}

/** "Tittar på bilden …" with a progress bar (EXPERIENCE.md, Bildanalys pågår). */
function Looking() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-ink">Tittar på bilden …</p>
      <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-hairline">
        <div className="h-full w-1/3 rounded-full bg-accent motion-safe:animate-progress" />
      </div>
    </div>
  );
}

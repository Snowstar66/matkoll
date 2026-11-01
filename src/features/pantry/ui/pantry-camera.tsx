"use client";

import { type ChangeEvent, type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { CameraIcon } from "@/components/icons";
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
import { useSiteSwitching } from "./site-switching";
import type { PhotoSite } from "../domain/site";
import { focusIsFree } from "./use-pantry-analysis";
import { takeHandedOverPhoto, useHandedOverLocation } from "./photo-handover";
import { AiWorking } from "@/components/ai-working";

// Kameraknappen (FR-24, UX-DR10, DESIGN.md camera-button): a light blue
// button across the width under the location cards, "Fotografera kylen"
// (frysen, skafferiet) after the chosen location. On a phone it opens the
// back camera and "Välj bild" under it opens the photo library; on a desktop
// it opens the file picker (EXPERIENCE.md, Responsive). No camera API beyond
// the file input. While a photo is analysed (a job in the background, Story
// 12.5), "Tittar på bilden … Du kan göra annat under tiden." with a progress
// bar, "I kö, 1 före." when it waits, and "Avbryt" take its place, for that
// place and location only: another location can be photographed at once. Errors and an empty answer show
// in a notice at the top of this area ("Allt i kylen stämmer med bilden."
// when a photo matches the place, Story 6.4), and the camera button takes focus back
// (unless Pontus has moved on, e.g. into the sheet); the rest of Hemma keeps
// working. Story 8.4: a photo is taken for the place Hemma shows; when that
// place is gone, the area says so ("Boendet finns inte längre. Välj ett annat
// boende.", without "Försök igen") and the page is read again.

export type PantryCameraProps = {
  /** The place Hemma shows (Story 8.4): a new photo is taken for it, and its suggestions stay with it. */
  site: PhotoSite;
  /** The chosen location: the button's text and the place a new photo shows. */
  location: Location;
  /** Story 14.6: the line under "Fotografera kylen" ("Senaste idag 15:42 · Visa", LatestPhoto); stays mounted while a photo is read. */
  children?: ReactNode;
};

export function PantryCamera({ site, location, children }: PantryCameraProps) {
  const {
    looking,
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
  // Story 12.5: whether the photo of this place and location is being read, or waits in the queue behind others.
  const looks = looking(site.id, location);
  const analyzing = looks !== null;
  const touch = useCoarsePointer();
  // Story 8.4: while Hemma switches place, a photo would be taken for the place being left.
  const switching = useSiteSwitching();
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

  // Story 20.1: a photo taken from the welcome tour's "Fotografera kylen" is read here, as if chosen here.
  const waiting = useHandedOverLocation();
  useEffect(() => {
    if (waiting !== location || switching) return;
    const file = takeHandedOverPhoto(location);
    if (file) analyze(file, location, site);
  }, [waiting, location, site, switching, analyze]);

  /** The chosen file; the field is emptied so the same photo can be chosen again. */
  function onChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) analyze(file, location, site);
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
      <div role="status" className="empty:-my-1.5">
        {looks ? <Looking waiting={looks.waiting} /> : announcement ? <span className="sr-only">{announcement}</span> : null}
      </div>
      {analyzing ? (
        <Button variant="text" onClick={() => cancel(site.id, location)} className="-ml-3 self-start">
          Avbryt
        </Button>
      ) : null}
      {/* Story 14.6: a quiet row like the shopping row in Matsedel. The camera button covers the card (stretched);
          the line under it, with "Visa", sits above that. While a photo is read it is hidden, not unmounted. */}
      {/* Story 19.7: the camera is a button (white, green text, a camera), "Välj bild" a text button beside it, and the
          line "Senaste foto … · Visa" a thin row under them. While a photo is read they are hidden, not unmounted. */}
      <div hidden={analyzing} className={analyzing ? "hidden" : "flex items-center gap-3"}>
        <Button
          variant="secondary"
          ref={cameraButtonRef}
          disabled={switching}
          onClick={() => (touch ? cameraRef : pickerRef).current?.click()}
          className="min-w-0 grow"
        >
          <CameraIcon size={22} />
          {cameraButtonText(location)}
        </Button>
        {touch ? (
          <Button variant="text" disabled={switching} onClick={() => pickerRef.current?.click()} className="shrink-0">
            Välj bild
          </Button>
        ) : null}
      </div>
      <div hidden={analyzing} className={analyzing ? "hidden" : "-mt-1"}>
        {children}
      </div>
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

/**
 * "Tittar på bilden … Du kan göra annat under tiden." with a progress bar
 * (EXPERIENCE.md, Bildanalys pågår), and "I kö, 1 före." while the photo waits
 * behind another AI job (Story 12.5).
 */
/** The input is always the photo of the place. */
const photoSteps = ["Tittar på bilden …", "Hittar varorna …", "Jämför med det du har …"];

function Looking({ waiting }: { waiting: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <AiWorking inLiveRegion steps={photoSteps} />
      <p className="text-meta text-ink-2">Du kan göra annat under tiden.</p>
      {waiting ? <p className="text-meta text-ink-2">{waiting}</p> : null}
      <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-hairline">
        <div className="h-full w-1/3 rounded-full bg-accent motion-safe:animate-progress" />
      </div>
    </div>
  );
}

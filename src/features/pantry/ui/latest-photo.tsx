"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { errorMessages } from "@/lib/errors";
import { removePlacePhoto } from "../actions/remove-place-photo";
import {
  latestPhotoOpenLabel,
  latestPhotoOpenText,
  latestPhotoText,
  photoReadingHeading,
  photoTakenText,
  placePhotoUrl,
  removedPhotoText,
  removePhotoQuestion,
  removePhotoText,
  savedPhotoAlt,
  savedPhotoMarkers,
  type PlacePhoto,
} from "../domain/place-photo";
import { AnalyzedPhotoSheet, badgeClasses } from "./analyzed-photo";
import { usePantrySuggestions } from "./pantry-suggestions";

// Senaste foto (Story 10.2, FR-38, FR-39, UX-DR21, UX-DR22): directly under
// the camera button, when the chosen location on the place Hemma shows has a
// photo younger than 30 days, the line "Senaste foto av kylen: idag 15:42"
// with the text button "Visa". No thumbnail, and nothing is fetched before
// "Visa": the photo sheet of Story 6.6 then loads the photo from
// GET /api/pantry/photo/[id], with a marker for each saved point and, under
// the photo, "AI:n läste av:" and the reading as a numbered list with the
// same numbers, and "Ta bort fotot" last. The line is not announced when the
// page loads.
//
// "Ta bort fotot" replaces the sheet with the question "Ta bort fotot av
// kylen? Det går inte att ångra." (sheets never stack; focus on "Avbryt",
// which brings the photo back). "Ta bort" waits for the server; a failure
// shows in the question with the photo kept. Afterwards the sheet closes,
// the line goes at once (the page is revalidated too), the short
// confirmation says "Fotot av kylen är borttaget.", and focus goes to the
// camera button, since the line it came from is gone. Closing the photo
// gives focus back to "Visa" (the sheet does that).
//
// A photo the browser cannot show says "Fotot kunde inte visas.". When the
// route says the photo is gone (another device removed it, or it got too
// old), the sheet says "Fotot finns inte längre." instead: an <img> cannot
// read the status, so a HEAD request asks the route once.

/** A saved photo with the time it was taken as Hemma writes it ("idag 15:42"). */
export type ShownPlacePhoto = PlacePhoto & { time: string };

export type LatestPhotoProps = {
  /** The latest photo of the chosen location on the place Hemma shows, or `null` for none: no line. */
  photo: ShownPlacePhoto | null;
  /** The chosen location. */
  location: Location;
};

type View = "closed" | "photo" | "ask";

export function LatestPhoto({ photo, location }: LatestPhotoProps) {
  const { showToast } = useToast();
  const { cameraButtonRef } = usePantrySuggestions();
  const [view, setView] = useState<View>("closed");
  /** Increases with every "Visa", so the photo gets a new try each time it is opened. */
  const [opened, setOpened] = useState(0);
  /** The photo the route said is gone. */
  const [goneId, setGoneId] = useState<string | null>(null);
  /** The photo removed here, hidden until the page's photos no longer have it. */
  const [removedId, setRemovedId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Increases when a photo is removed, so the camera button can take focus. */
  const [removed, setRemoved] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // After the commit that closed the question, whose own focus return runs first.
  useEffect(() => {
    if (removed > 0) cameraButtonRef.current?.focus();
  }, [removed, cameraButtonRef]);

  if (!photo) return null;
  const shown = removedId !== photo.id;
  const markers = savedPhotoMarkers(photo.points, photo.reading);
  const url = placePhotoUrl(photo.id);

  /** The photo could not be shown: is it gone? An <img> cannot tell, so the route is asked once, without the image. */
  function checkGone(id: string) {
    void fetch(placePhotoUrl(id), { method: "HEAD", cache: "no-store" })
      .then((response) => {
        if (response.status === 404 && mounted.current) setGoneId(id);
      })
      .catch(() => {});
  }

  function ask() {
    setError(null);
    setView("ask");
  }

  async function remove(id: string, shownLocation: Location) {
    if (inFlight.current) return;
    inFlight.current = true;
    setRemoving(true);
    setError(null);
    try {
      const result = await removePlacePhoto({ id });
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRemovedId(id);
      setView("closed");
      showToast(removedPhotoText(shownLocation));
      setRemoved((times) => times + 1);
    } catch {
      if (mounted.current) setError(errorMessages.pantry_photo_remove_failed);
    } finally {
      inFlight.current = false;
      if (mounted.current) setRemoving(false);
    }
  }

  return (
    <>
      {shown ? (
        <div data-testid="pantry-latest-photo" className="-mt-3 flex flex-wrap items-center gap-x-1">
          <p className="text-meta text-ink-2">{latestPhotoText(location, photo.time)}</p>
          <Button
            variant="text"
            aria-haspopup="dialog"
            aria-label={latestPhotoOpenLabel(location)}
            onClick={(event) => {
              // Safari does not focus a tapped button: the sheet gives focus back to what had it when it opened.
              event.currentTarget.focus();
              setOpened((times) => times + 1);
              setView("photo");
            }}
            className="-ml-1"
          >
            {latestPhotoOpenText}
          </Button>
        </div>
      ) : null}
      <AnalyzedPhotoSheet
        key={`${photo.id}:${opened}`}
        photo={{ url, size: { width: photo.width, height: photo.height } }}
        location={location}
        open={view === "photo"}
        onClose={() => setView("closed")}
        markers={markers}
        onPhotoError={() => checkGone(photo.id)}
        subtitle={photoTakenText(photo.time, markers.length > 0)}
        alt={savedPhotoAlt(location)}
        errorText={goneId === photo.id ? errorMessages.pantry_photo_gone : undefined}
      >
        <div className="flex flex-col gap-2 pt-4">
          {photo.reading.length > 0 ? (
            <>
              <h3 className="text-row-title text-ink">{photoReadingHeading}</h3>
              <ol data-testid="pantry-photo-reading" className="flex flex-col gap-2">
                {photo.reading.map((label, index) => (
                  <li key={index} className="flex items-start gap-3 text-body text-ink">
                    <span aria-hidden="true" className={badgeClasses}>
                      {index + 1}
                    </span>
                    <span className="min-w-0 pt-0.5 break-words">
                      <span className="sr-only">{index + 1}. </span>
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          <Button variant="text" onClick={ask} className="-ml-3 self-start">
            {removePhotoText}
          </Button>
        </div>
      </AnalyzedPhotoSheet>
      <Sheet
        open={view === "ask"}
        onClose={() => setView("photo")}
        title={removePhotoText}
        closeLabel="Avbryt"
        initialFocus="close"
        preventClose={removing}
        footer={
          <>
            {error ? <Notice role="alert">{error}</Notice> : null}
            <Button fullWidth disabled={removing} onClick={() => void remove(photo.id, location)}>
              {removing ? "Tar bort …" : "Ta bort"}
            </Button>
          </>
        }
      >
        <p className="text-body text-ink">{removePhotoQuestion(location)}</p>
      </Sheet>
    </>
  );
}

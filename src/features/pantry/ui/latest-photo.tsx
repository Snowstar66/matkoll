"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
  noPhotoText,
  photoReadingHeading,
  photoTimeText,
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

// Senaste foto (Story 10.2, FR-38, FR-39, UX-DR21, UX-DR22): centred directly
// under the camera button, when the chosen location on the place Förråd
// shows has a photo younger than 30 days, the line "Senaste foto av kylen:
// idag 15:42 · Visa" in meta type, as in the Epic 11 mockup (lagersaldo.html).
// No thumbnail, and nothing is fetched before "Visa": the photo sheet of
// Story 6.6 then loads the photo from GET /api/pantry/photo/[id], with a
// marker for each saved point and, under the photo, the section label "AI:n
// läste av:" and the reading as a numbered list with hairlines and the same
// numbers, and "Ta bort fotot" last. The line is not announced when the page
// loads.
//
// "Ta bort fotot" is not a bin with "Ångra" (Story 11.3): the file cannot be
// brought back, so it replaces the sheet with the question "Ta bort fotot av
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

//
// Review of 10.2: "Visa" freezes the photo it opens, so the sheet, the
// question and "Ta bort" always act on that photo's id. A newer photo of the
// place saved in the background (the page is read again) closes them rather
// than changing what "Ta bort" removes. The time is written again in the
// browser after the first render, and when the page becomes visible, so
// "idag" never stays on a page left open overnight.

/** A saved photo with the time it was taken as the server wrote it ("idag 15:42"). */
export type ShownPlacePhoto = PlacePhoto & { time: string };

export type LatestPhotoProps = {
  /** The latest photo of the chosen location on the place Förråd shows, or `null` for none: no line. */
  photo: ShownPlacePhoto | null;
  /** The chosen location. */
  location: Location;
};

type View = "closed" | "photo" | "ask";

/** The time now, `null` until mounted (the server's text is shown then), and again whenever the page becomes visible. */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    const first = setTimeout(update, 0);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return now;
}

export function LatestPhoto({ photo, location }: LatestPhotoProps) {
  const { showToast } = useToast();
  const router = useRouter();
  const { cameraButtonRef } = usePantrySuggestions();
  const now = useNow();
  const [view, setView] = useState<View>("closed");
  /** The photo "Visa" opened: the sheet, the question and "Ta bort" act on it alone. */
  const [openPhoto, setOpenPhoto] = useState<ShownPlacePhoto | null>(null);
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
  const readingHeadingId = useId();

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

  // Another photo came while one was open (a newer one saved in the
  // background): close the sheet or the question, so "Ta bort" never meets
  // it. No photo at all (gone, read again after the route said so) keeps the
  // sheet, which says "Fotot finns inte längre.".
  if (view !== "closed" && openPhoto && photo && photo.id !== openPhoto.id) setView("closed");

  /** When `shown` was taken: written here once mounted, the server's text before. */
  const timeOf = (shown: ShownPlacePhoto) => (now ? photoTimeText(new Date(shown.takenAt), now) : shown.time);

  /** The photo could not be shown: is it gone? An <img> cannot tell, so the route is asked once, without the image. */
  function checkGone(id: string) {
    void fetch(placePhotoUrl(id), { method: "HEAD", cache: "no-store" })
      .then((response) => {
        if (response.status !== 404 || !mounted.current) return;
        setGoneId(id);
        // The line still shows a photo that is gone: read the page again.
        router.refresh();
      })
      .catch(() => {});
  }

  function ask() {
    setError(null);
    setView("ask");
  }

  async function remove(target: ShownPlacePhoto) {
    if (inFlight.current) return;
    inFlight.current = true;
    setRemoving(true);
    setError(null);
    try {
      const result = await removePlacePhoto({ id: target.id });
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRemovedId(target.id);
      setView("closed");
      // Gone already (another device): say so, not that it was removed here.
      showToast(result.data.removed ? removedPhotoText(target.location) : errorMessages.pantry_photo_gone);
      setRemoved((times) => times + 1);
    } catch {
      if (mounted.current) setError(errorMessages.pantry_photo_remove_failed);
    } finally {
      inFlight.current = false;
      if (mounted.current) setRemoving(false);
    }
  }

  const sheetPhoto = openPhoto;
  const markers = sheetPhoto ? savedPhotoMarkers(sheetPhoto.points, sheetPhoto.reading) : [];

  return (
    <>
      {photo && removedId !== photo.id ? (
        // Under "Fotografera kylen" in the camera row (Story 14.6): "Senaste idag 15:42 · Visa".
        <div data-testid="pantry-latest-photo" className="flex flex-wrap items-center gap-x-1 text-meta text-ink-3">
          <p>
            {latestPhotoText(timeOf(photo))}
            <span aria-hidden="true"> ·</span>
          </p>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={latestPhotoOpenLabel(location)}
            onClick={(event) => {
              // Safari does not focus a tapped button: the sheet gives focus back to what had it when it opened.
              event.currentTarget.focus();
              setOpenPhoto(photo);
              setOpened((times) => times + 1);
              setView("photo");
            }}
            // A text button in meta type that keeps a 44 px tap area without making the line taller.
            className="-mx-2 -my-3 inline-flex min-h-tap min-w-tap items-center justify-center rounded-md px-2 text-meta font-semibold text-accent"
          >
            {latestPhotoOpenText}
          </button>
        </div>
      ) : (
        <p data-testid="pantry-no-photo" className="text-meta text-ink-3">
          {noPhotoText}
        </p>
      )}
      {sheetPhoto ? (
        <>
          <AnalyzedPhotoSheet
            key={`${sheetPhoto.id}:${opened}`}
            photo={{ url: placePhotoUrl(sheetPhoto.id), size: { width: sheetPhoto.width, height: sheetPhoto.height } }}
            location={sheetPhoto.location}
            open={view === "photo"}
            onClose={() => setView("closed")}
            markers={markers}
            onPhotoError={() => checkGone(sheetPhoto.id)}
            subtitle={photoTakenText(timeOf(sheetPhoto), markers.length > 0)}
            alt={savedPhotoAlt(sheetPhoto.location)}
            errorText={goneId === sheetPhoto.id ? errorMessages.pantry_photo_gone : undefined}
          >
            <div className="flex flex-col gap-2 pt-5">
              {sheetPhoto.reading.length > 0 ? (
                <>
                  {/* A section label, as over Förråd's categories (Epic 11). */}
                  <h3 id={readingHeadingId} className="px-1 text-section-label text-ink-2">
                    {photoReadingHeading}
                  </h3>
                  {/* A list group's hairlines; the sheet is the card. role="list" keeps the list for VoiceOver in Safari. */}
                  <ol
                    role="list"
                    aria-labelledby={readingHeadingId}
                    data-testid="pantry-photo-reading"
                    className="flex flex-col divide-y divide-hairline"
                  >
                    {sheetPhoto.reading.map((label, index) => (
                      <li key={index} className="flex items-start gap-3 py-2.5 text-body text-ink">
                        <span aria-hidden="true" className={badgeClasses}>
                          {index + 1}
                        </span>
                        <span className="min-w-0 pt-0.5 wrap-break-word">
                          <span className="sr-only">{index + 1}. </span>
                          {label}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
              {/* Not a bin: the file cannot be brought back, so it asks first (EXPERIENCE.md, Fotoark). */}
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
                <Button fullWidth disabled={removing} onClick={() => void remove(sheetPhoto)}>
                  {removing ? "Tar bort …" : "Ta bort"}
                </Button>
              </>
            }
          >
            <p className="text-body text-ink">{removePhotoQuestion(sheetPhoto.location)}</p>
          </Sheet>
        </>
      ) : null}
    </>
  );
}

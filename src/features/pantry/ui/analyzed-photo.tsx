"use client";

import { type CSSProperties, useState } from "react";
import { cx } from "@/components/cx";
import { Sheet } from "@/components/sheet";
import type { Location } from "@/features/catalog";
import {
  analyzedPhotoAlt,
  analyzedPhotoErrorText,
  analyzedPhotoFullSizeText,
  analyzedPhotoNoteText,
  analyzedPhotoOpenText,
  analyzedPhotoTitle,
} from "../domain/pantry-suggestion";
import { photoNumberText, type PhotoMarker } from "../domain/photo-numbers";
import type { ReviewPhoto } from "./use-pantry-analysis";

// The photo during review (quick fix after Story 6.5): at the top of
// Lagerförslag, a thumbnail of the resized photo that was sent ("Fotot av
// kylen"), so Pontus can check the reading. A tap opens it larger in a sheet,
// which closes with "Stäng", Esc, a tap outside or a swipe down, and gives
// focus back to the thumbnail. In the sheet, a tap on the photo switches
// between fitting the screen and full size, which scrolls inside the sheet,
// so small print can be read. A photo the browser cannot show says so
// instead. The URL is an object URL owned by usePantryAnalysis, in this
// browser's memory only (AD-15).
//
// Story 6.6: once the points have come, the large photo has a round number
// on each item of a card shown, and the card the same number
// (PhotoNumberBadge). The thumbnail has none: at 72 px they cannot be read.

export type AnalyzedPhotoButtonProps = {
  photo: ReviewPhoto;
  /** The place the photo shows. */
  location: Location;
  onOpen: () => void;
};

/** The thumbnail that opens the photo; a short text instead when it cannot be shown. */
export function AnalyzedPhotoButton({ photo, location, onOpen }: AnalyzedPhotoButtonProps) {
  // Per URL, so the next photo gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (failedUrl === photo.url) return <p className="text-meta text-ink-2">{analyzedPhotoErrorText}</p>;
  const title = analyzedPhotoTitle(location);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      // The visible text, in order, so a voice command with what is shown works too.
      aria-label={`${title}, ${analyzedPhotoOpenText.toLowerCase()}`}
      data-testid="pantry-analyzed-photo"
      onClick={(event) => {
        // Safari does not focus a tapped button: the sheet gives focus back to what had it when it opened.
        event.currentTarget.focus();
        onOpen();
      }}
      className="flex max-w-full min-w-0 items-center gap-[14px] self-start rounded-lg bg-surface p-3 text-left"
    >
      {/* A plain <img>: an object URL in this browser, which next/image cannot optimise. The label names the button. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt=""
        width={photo.size?.width}
        height={photo.size?.height}
        draggable={false}
        onError={() => setFailedUrl(photo.url)}
        className="size-thumb shrink-0 rounded-md object-cover"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-row-title break-words text-ink">{title}</span>
        <span className="text-meta text-accent">{analyzedPhotoOpenText}</span>
      </span>
    </button>
  );
}

/** A card's number and a marker on the photo look alike (Story 6.6): a round number in the accent colour. */
const numberClasses =
  "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-badge text-on-accent";

/**
 * A card's number on the photo (Story 6.6): the number to see, and "Nummer
 * 3 på fotot" for a screen reader, which cannot see the markers.
 */
export function PhotoNumberBadge({ number }: { number: number }) {
  return (
    <span data-testid="pantry-photo-number" className={numberClasses}>
      <span aria-hidden="true">{number}</span>
      <span className="sr-only">{photoNumberText(number)}</span>
    </span>
  );
}

export type AnalyzedPhotoSheetProps = {
  photo: ReviewPhoto;
  location: Location;
  open: boolean;
  onClose: () => void;
  /** Story 6.6: the cards' numbers on the photo, in percent of its width and height; none before they have come. */
  markers?: readonly PhotoMarker[];
};

/**
 * The photo larger. Key it on the URL, so a new photo starts closed and
 * fitted, and an open sheet never changes to another photo. Story 6.6: the
 * markers sit on a box with the photo's own size or proportions, placed in
 * percent, so they stay on their items both fitted and in full size. They
 * are hidden from screen readers: the cards carry the numbers. Without a
 * known size there is no such box, and no markers.
 */
export function AnalyzedPhotoSheet({ photo, location, open, onClose, markers = [] }: AnalyzedPhotoSheetProps) {
  const [failed, setFailed] = useState(false);
  const [fullSize, setFullSize] = useState(false);
  const { size } = photo;
  // With the size known, the box is laid out before the photo is decoded, so the sheet does not jump.
  let style: CSSProperties | undefined;
  if (size && fullSize) {
    style = { width: size.width, height: size.height };
  } else if (size) {
    style = {
      aspectRatio: `${size.width} / ${size.height}`,
      width: `min(100%, calc(70dvh * ${size.width} / ${size.height}))`,
    };
  }
  return (
    <Sheet
      open={open}
      onClose={() => {
        setFullSize(false);
        onClose();
      }}
      title={analyzedPhotoTitle(location)}
      subtitle={analyzedPhotoNoteText}
      closeLabel="Stäng"
    >
      {failed ? (
        <p className="text-body text-ink-2">{analyzedPhotoErrorText}</p>
      ) : (
        <button
          type="button"
          aria-pressed={fullSize}
          aria-label={analyzedPhotoFullSizeText}
          data-testid="pantry-analyzed-photo-large"
          onClick={() => setFullSize((full) => !full)}
          className={cx("block rounded-md", fullSize ? "w-max" : "w-full")}
        >
          {size ? (
            <span data-testid="pantry-photo-frame" style={style} className={cx("relative block", !fullSize && "mx-auto")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={analyzedPhotoAlt(location)}
                width={size.width}
                height={size.height}
                draggable={false}
                onError={() => setFailed(true)}
                className="block size-full max-w-none rounded-md"
              />
              {markers.map((marker) => (
                <span
                  key={marker.key}
                  aria-hidden="true"
                  data-testid="pantry-photo-marker"
                  style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
                  className={cx(numberClasses, "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 border-2 border-surface")}
                >
                  {marker.label}
                </span>
              ))}
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt={analyzedPhotoAlt(location)}
              draggable={false}
              onError={() => setFailed(true)}
              className={cx("block rounded-md", fullSize ? "max-w-none" : "mx-auto max-h-[70dvh] w-auto max-w-full")}
            />
          )}
        </button>
      )}
    </Sheet>
  );
}

"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import { cx } from "@/components/cx";
import { Sheet } from "@/components/sheet";
import type { Location } from "@/features/catalog";
import type { ImageSize } from "@/lib/images";
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
// (PhotoNumberBadge, and PhotoNumberText in its heading). The thumbnail has
// none: at 72 px they cannot be read. A photo that cannot be shown takes the
// numbers with it (onPhotoError).

export type AnalyzedPhotoButtonProps = {
  photo: ReviewPhoto;
  /** The place the photo shows. */
  location: Location;
  onOpen: () => void;
  /** Story 6.6: the photo cannot be shown, so its numbers go. */
  onPhotoError?: () => void;
};

/** The thumbnail that opens the photo; a short text instead when it cannot be shown. */
export function AnalyzedPhotoButton({ photo, location, onOpen, onPhotoError }: AnalyzedPhotoButtonProps) {
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
        onError={() => {
          setFailedUrl(photo.url);
          onPhotoError?.();
        }}
        className="size-thumb shrink-0 rounded-md object-cover"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-row-title break-words text-ink">{title}</span>
        <span className="text-meta text-accent">{analyzedPhotoOpenText}</span>
      </span>
    </button>
  );
}

/**
 * A card's number and a marker on the photo look alike (Story 6.6): a round
 * number in the accent colour. Minimum sizes and padding rather than a fixed
 * size, so "25" fits at 200 % text.
 */
const numberClasses =
  "inline-flex shrink-0 items-center justify-center rounded-full bg-accent text-badge leading-none text-on-accent";
/** A card's number; Story 10.2's list of the reading has the same. */
export const badgeClasses = cx(numberClasses, "min-h-7 min-w-7 px-1.5 py-1");
const markerClasses = cx(numberClasses, "min-h-6 min-w-6 px-1 py-0.5");
/** Half a marker and its border, at 200 % text: a marker is kept this far inside the photo's edges. */
const markerInset = "14px";

/**
 * A card's number on the photo (Story 6.6), as seen; hidden from screen
 * readers, since the card's heading says "Nummer 3 på fotot" (PhotoNumberText).
 * `null` keeps its place empty while the numbers are looked up, so the title
 * does not move when they come.
 */
export function PhotoNumberBadge({ number }: { number: number | null }) {
  if (number === null) {
    return <span aria-hidden="true" data-testid="pantry-photo-number-slot" className={cx(badgeClasses, "invisible")} />;
  }
  return (
    <span aria-hidden="true" data-testid="pantry-photo-number" className={badgeClasses}>
      {number}
    </span>
  );
}

/** The card's number for a screen reader, inside its heading after the title: "Nummer 3 på fotot". */
export function PhotoNumberText({ number }: { number: number }) {
  return <span className="sr-only"> {photoNumberText(number)}</span>;
}

export type AnalyzedPhotoSheetProps = {
  /** The photo's URL, and its size when known (it lays out the box the markers sit on). */
  photo: Pick<ReviewPhoto, "url" | "size">;
  location: Location;
  open: boolean;
  onClose: () => void;
  /** Story 6.6: the cards' numbers on the photo, in percent of its width and height; none before they have come. */
  markers?: readonly PhotoMarker[];
  /** Story 6.6: the photo cannot be shown, so its numbers go. */
  onPhotoError?: () => void;
  /** Story 10.2: the line under the title; during review it is analyzedPhotoNoteText. */
  subtitle?: string;
  /** Story 10.2: the photo's alt text; during review it is analyzedPhotoAlt. */
  alt?: string;
  /** Story 10.2: what is said when the photo cannot be shown; analyzedPhotoErrorText unless given. */
  errorText?: string;
  /** Story 10.2: what comes under the photo (the reading and "Ta bort fotot"); nothing during review. */
  children?: ReactNode;
};

/**
 * The photo larger. Key it on the URL, so a new photo starts closed and
 * fitted, and an open sheet never changes to another photo. Story 6.6: the
 * markers sit on a box with the photo's own size or proportions, placed in
 * percent, so they stay on their items both fitted and in full size. The
 * box takes the size of the photo as decoded, so the markers sit on the
 * pixels the model saw even if the file's header says otherwise; until it is
 * decoded, the header's size lays it out, and there are no markers. A marker
 * is kept inside the box, and is a little see-through when fitted, so the
 * package under it shows. They are hidden from screen readers: the cards
 * carry the numbers. Without a size in the header there is no such box, and
 * no markers.
 *
 * Story 10.2: the same sheet shows the latest saved photo of a place, with
 * its own subtitle and alt text, and the reading and "Ta bort fotot" under
 * the photo (`children`).
 */
export function AnalyzedPhotoSheet({
  photo,
  location,
  open,
  onClose,
  markers = [],
  onPhotoError,
  subtitle = analyzedPhotoNoteText,
  alt = analyzedPhotoAlt(location),
  errorText = analyzedPhotoErrorText,
  children,
}: AnalyzedPhotoSheetProps) {
  const [failed, setFailed] = useState(false);
  const [fullSize, setFullSize] = useState(false);
  const [decoded, setDecoded] = useState<ImageSize | null>(null);
  const size = photo.size ? (decoded ?? photo.size) : null;
  const failWith = () => {
    setFailed(true);
    onPhotoError?.();
  };
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
      subtitle={subtitle}
      closeLabel="Stäng"
    >
      {/* Mounted empty, so VoiceOver says the text when the photo fails, and again if it changes to "Fotot finns inte längre.". */}
      <div role="status">{failed ? <p className="text-body text-ink-2">{errorText}</p> : null}</div>
      {failed ? null : (
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
                alt={alt}
                width={size.width}
                height={size.height}
                draggable={false}
                onLoad={(event) => {
                  const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                  if (width > 0 && height > 0) setDecoded({ width, height });
                }}
                onError={failWith}
                className="block size-full max-w-none rounded-md object-contain"
              />
              {decoded
                ? markers.map((marker) => (
                    <span
                      key={marker.key}
                      aria-hidden="true"
                      data-testid="pantry-photo-marker"
                      style={{
                        left: `clamp(${markerInset}, ${marker.left}%, calc(100% - ${markerInset}))`,
                        top: `clamp(${markerInset}, ${marker.top}%, calc(100% - ${markerInset}))`,
                      }}
                      className={cx(
                        markerClasses,
                        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 border-2 border-surface",
                        !fullSize && "opacity-85",
                      )}
                    >
                      {marker.label}
                    </span>
                  ))
                : null}
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt={alt}
              draggable={false}
              onError={failWith}
              className={cx("block rounded-md", fullSize ? "max-w-none" : "mx-auto max-h-[70dvh] w-auto max-w-full")}
            />
          )}
        </button>
      )}
      {children}
    </Sheet>
  );
}

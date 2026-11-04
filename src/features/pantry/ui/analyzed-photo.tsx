"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "@/components/cx";
import { ExpandIcon } from "@/components/icons";
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
  markerLabel,
} from "../domain/pantry-suggestion";
import { notPointedText, photoNumberText, spreadMarkers, type PhotoMarker } from "../domain/photo-numbers";
import type { ReviewPhoto } from "./use-pantry-analysis";

// The photo during review (quick fix after Story 6.5): at the top of
// Lagerförslag, a thumbnail of the resized photo that was sent ("Fotot av
// kylen"), so Pontus can check the reading. A tap opens it larger in a sheet,
// which closes with "Klar", Esc, a tap outside or a swipe down, and gives
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
// numbers with it (onPhotoError). Kylfoto B: the points come with the
// reading, from every model, so the numbers are there with the cards.
//
// Kylfoto D: the thumbnail is gone. The photo sits on top of the review
// (ReviewPhotoPanel) with the rows' numbers as buttons, and the sheet Rätta
// shows the photo around its item (PhotoCrop). The sheet below is the photo
// full screen.

/** Kylfoto D: a marker on the review photo, with the row's name and how its row stands. */
export type ReviewMarker = PhotoMarker & {
  /** The row's catalog name, for the button's name: "Vara 3: Grädde". */
  name: string;
  /** Ticked (accent), not ticked (dark grey), or unsure and not ticked (warm). */
  tone: "on" | "off" | "unsure";
};

export type ReviewPhotoProps = {
  /** The photo shown large. */
  photo: ReviewPhoto;
  /** Kylfoto, flera foton: every photo of the reading, as a strip under the large one when there are several. */
  photos?: readonly ReviewPhoto[];
  /** A tap on a photo of the strip: it is shown large. */
  onChoosePhoto?: (url: string) => void;
  /** The place the photo shows. */
  location: Location;
  /** The rows' numbers on the photo; none before they have come. */
  markers: readonly ReviewMarker[];
  /** The number lit up, on the photo and in the list, or `null`. */
  selected: number | null;
  /** A tap on a marker. */
  onSelectMarker: (number: number) => void;
  /** A tap on the photo: it opens full screen. */
  onOpen: () => void;
  /** Story 6.6: the photo cannot be shown, so its numbers go. */
  onPhotoError?: () => void;
};

/** Kylfoto, flera foton: the strip of the reading's photos, for a screen reader. */
const photoStripLabel = "Fotona i inläsningen";

/** Kylfoto, flera foton: a photo of the strip: "Foto 2 av 3". */
export function photoOfText(n: number, total: number): string {
  return `Foto ${n} av ${total}`;
}

/** The photo's height at the top of the review, and once the list has scrolled under it (decision 11). */
const reviewPhotoHeight = { full: 330, mini: 200 };

/**
 * Kylfoto D: the photo on top of the review, with the rows' numbers on it.
 * It sticks to the top while the list scrolls, and shrinks from 330 to 200
 * px once it does, so the numbers always show. A tap on the photo opens it
 * full screen (AnalyzedPhotoSheet); a tap on a marker lights up its row. The
 * markers are buttons ("Vara 3: Grädde"); the lit one is larger with a ring,
 * and the others fade. The photo sits in its own proportions in the middle of
 * a dark box, and the markers in percent of it, once it is decoded. A photo
 * that cannot be shown says so instead.
 */
export function ReviewPhotoPanel({
  photo,
  photos = [],
  onChoosePhoto,
  location,
  markers,
  selected,
  onSelectMarker,
  onOpen,
  onPhotoError,
}: ReviewPhotoProps) {
  // Per URL, so the next photo gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [decoded, setDecoded] = useState<{ url: string; size: ImageSize } | null>(null);
  const [mini, setMini] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // Kylfoto: the stage's width, so markers that would overlap on the photo as shown are nudged apart.
  const [stageWidth, setStageWidth] = useState<number | null>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setStageWidth(stage.clientWidth || null);
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => setStageWidth(stage.clientWidth || null));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Shrinks once the panel sticks (the line above it has scrolled past where it sticks, under the page's slim bar on
  // a phone), and grows back when it is in its place again.
  useEffect(() => {
    const update = () => {
      const top = sentinelRef.current?.getBoundingClientRect().top;
      if (top === undefined || !panelRef.current) return;
      const sticksAt = Number.parseFloat(getComputedStyle(panelRef.current).top) || 0;
      setMini((was) => (was ? top < sticksAt : top < sticksAt - 24));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (failedUrl === photo.url) return <p className="text-meta text-ink-2">{analyzedPhotoErrorText}</p>;
  const title = analyzedPhotoTitle(location);
  const decodedSize = decoded?.url === photo.url ? decoded.size : null;
  const size = decodedSize ?? photo.size ?? null;
  const height = mini ? reviewPhotoHeight.mini : reviewPhotoHeight.full;
  // The photo's box as shown: as high as the stage, or narrower when the stage is narrower than the photo is wide.
  let shownMarkers: readonly ReviewMarker[] = markers;
  if (decodedSize) {
    const width = Math.min(stageWidth ?? Infinity, (height * decodedSize.width) / decodedSize.height);
    shownMarkers = spreadMarkers(markers, { width, height: (width * decodedSize.height) / decodedSize.width });
  }
  return (
    <>
      {/* Takes no room: the section's gap stays as it was. */}
      <div ref={sentinelRef} aria-hidden="true" className="-mb-3" />
      <div
        ref={panelRef}
        data-testid="pantry-review-photo"
        data-mini={mini || undefined}
        // Under the page's slim bar on a phone (CollapsingTitleRow, 52 px), at the top on a desktop; above the rows' tick boxes.
        className="sticky top-[calc(52px+env(safe-area-inset-top))] z-20 -mx-page bg-bg px-page pt-1 pb-1 desktop:top-0 desktop:mx-0 desktop:px-0 desktop:pt-2"
      >
        <div
          ref={stageRef}
          style={{ height }}
          className="relative flex items-center justify-center overflow-hidden rounded-[16px] bg-photo-stage transition-[height] duration-[260ms] ease-[cubic-bezier(.22,.8,.24,1)] motion-reduce:transition-none"
        >
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
            className="absolute inset-0 cursor-zoom-in -outline-offset-2"
          />
          <div
            style={
              size
                ? {
                    aspectRatio: `${size.width} / ${size.height}`,
                    width: `min(100%, ${(height * size.width) / size.height}px)`,
                  }
                : { height: "100%" }
            }
            className="pointer-events-none relative transition-[width] duration-[260ms] ease-[cubic-bezier(.22,.8,.24,1)] motion-reduce:transition-none"
          >
            {/* A plain <img>: an object URL in this browser, which next/image cannot optimise. The button names it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt=""
              width={size?.width}
              height={size?.height}
              draggable={false}
              onLoad={(event) => {
                const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                if (width > 0 && height > 0) setDecoded({ url: photo.url, size: { width, height } });
              }}
              onError={() => {
                setFailedUrl(photo.url);
                onPhotoError?.();
              }}
              className={cx("block max-w-none object-contain", size ? "size-full" : "h-full w-auto")}
            />
            {decodedSize
              ? shownMarkers.map((marker) => {
                  const lit = selected === marker.label;
                  return (
                    <button
                      key={marker.key}
                      type="button"
                      aria-label={markerLabel(marker.label, marker.name)}
                      aria-pressed={lit}
                      data-testid="pantry-review-marker"
                      data-tone={marker.tone}
                      onClick={() => onSelectMarker(marker.label)}
                      style={{
                        left: `clamp(${markerInset}, ${marker.left}%, calc(100% - ${markerInset}))`,
                        top: `clamp(${markerInset}, ${marker.top}%, calc(100% - ${markerInset}))`,
                      }}
                      className={cx(
                        reviewMarkerClasses(marker.tone),
                        "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 transition-[scale,opacity,box-shadow] duration-200 motion-reduce:transition-none",
                        // A 44 px tap area around the 22 px marker.
                        "before:absolute before:-inset-[11px] before:content-['']",
                        lit
                          ? "z-20 scale-140 shadow-(--marker-lit)"
                          : "z-10",
                        selected !== null && !lit && "opacity-35",
                      )}
                    >
                      {marker.label}
                    </button>
                  );
                })
              : null}
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2.5 right-2.5 z-20 flex size-[34px] items-center justify-center rounded-full bg-photo-chip text-photo-mark backdrop-blur-md"
          >
            <ExpandIcon size={18} />
          </span>
        </div>
        {photos.length > 1 ? (
          // Kylfoto, flera foton: the reading's photos as a strip; the one shown large is ringed. Once the list has
          // scrolled under the photo it is small, and the strip folds away, so the rows keep their room.
          <div
            role="group"
            aria-label={photoStripLabel}
            data-testid="pantry-review-strip"
            hidden={mini}
            className={mini ? "hidden" : "flex gap-2 overflow-x-auto pt-2 pb-1"}
          >
            {photos.map((other, index) => {
              const shown = other.url === photo.url;
              return (
                <button
                  key={other.url}
                  type="button"
                  aria-pressed={shown}
                  aria-label={photoOfText(index + 1, photos.length)}
                  data-testid="pantry-review-thumb"
                  onClick={() => onChoosePhoto?.(other.url)}
                  className={cx(
                    "relative h-11 w-14 shrink-0 overflow-hidden rounded-[10px] bg-photo-stage outline-offset-2",
                    shown ? "ring-2 ring-accent" : "opacity-70",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={other.url} alt="" draggable={false} className="size-full object-cover" />
                  <span className="absolute right-1 bottom-0.5 text-[11px] font-semibold text-photo-mark [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]">
                    {index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}

export type PhotoCropProps = {
  /** The photo's URL. */
  url: string;
  /** The item's point, in thousandths of the photo's width and height. */
  x: number;
  y: number;
  /** The row's number, on the marker. */
  number: number;
};

/**
 * Kylfoto D: at the top of the sheet Rätta, the photo around the item's
 * point, 2.5 times enlarged, with its marker on it, so what the AI means
 * shows without leaving the sheet. The photo is a background placed at the
 * point's own percentages, which keeps it inside the box at the edges and
 * puts the point at the same percentages of the box: the marker goes there.
 * Only for the eye; the sheet's title names the item.
 */
export function PhotoCrop({ url, x, y, number }: PhotoCropProps) {
  const left = x / 10;
  const top = y / 10;
  return (
    <div
      aria-hidden="true"
      data-testid="pantry-sheet-crop"
      style={{
        backgroundImage: `url("${url}")`,
        backgroundSize: "250% auto",
        backgroundPosition: `${left}% ${top}%`,
        backgroundRepeat: "no-repeat",
      }}
      className="relative h-[120px] shrink-0 overflow-hidden rounded-[14px] bg-photo-stage"
    >
      <span
        style={{
          left: `clamp(${markerInset}, ${left}%, calc(100% - ${markerInset}))`,
          top: `clamp(${markerInset}, ${top}%, calc(100% - ${markerInset}))`,
        }}
        className={cx(reviewMarkerClasses("on"), "absolute -translate-x-1/2 -translate-y-1/2")}
      >
        {number}
      </span>
    </div>
  );
}

/**
 * A card's number and a marker on the photo (Story 6.6): a round number.
 * Kylfoto B: the card's is small and quiet, ink-2 in a hairline circle, so
 * it never looks like a checkbox or a button; the marker on the photo is
 * filled with the accent colour, so it shows on any package. Minimum sizes
 * and padding rather than a fixed size, so "25" fits at 200 % text.
 */
const numberClasses = "inline-flex shrink-0 items-center justify-center rounded-full text-badge leading-none";
/** A card's number, 20 px; Story 10.2's list of the reading has the same. */
export const badgeClasses = cx(numberClasses, "min-h-5 min-w-5 border border-border px-1 text-ink-2");
const markerClasses = cx(numberClasses, "min-h-6 min-w-6 bg-accent px-1 py-0.5 text-on-accent");

/**
 * Kylfoto D: a marker on the review photo and in the sheet's crop: 22 px,
 * filled, with a white edge (dark in dark mode) and a shadow; accent when
 * its row is ticked, dark grey when not, warm when unsure and not ticked.
 */
function reviewMarkerClasses(tone: ReviewMarker["tone"]) {
  return cx(
    numberClasses,
    "min-h-[22px] min-w-[22px] border-2 border-marker-edge px-[5px] text-[12px] font-semibold shadow-(--marker-shadow)",
    tone === "on" && "bg-accent text-on-accent",
    tone === "off" && "bg-marker-off text-photo-mark",
    tone === "unsure" && "bg-warm text-on-warm",
  );
}
/** Half a marker and its border, at 200 % text: a marker is kept this far inside the photo's edges. */
const markerInset = "14px";

/**
 * A card's number on the photo (Story 6.6), as seen; hidden from screen
 * readers, since the card's heading says "Nummer 3 på fotot" (PhotoNumberText).
 * `null` keeps its place empty while the numbers are looked up, so the title
 * does not move when they come. Kylfoto: a number the model did not point
 * out on the photo (`pointed` false) has a dashed ring, so it is not looked
 * for there.
 */
export function PhotoNumberBadge({ number, pointed = true }: { number: number | null; pointed?: boolean }) {
  if (number === null) {
    return <span aria-hidden="true" data-testid="pantry-photo-number-slot" className={cx(badgeClasses, "invisible")} />;
  }
  return (
    <span
      aria-hidden="true"
      data-testid="pantry-photo-number"
      data-pointed={pointed ? undefined : "false"}
      className={cx(badgeClasses, !pointed && "border-dashed text-ink-3")}
    >
      {number}
    </span>
  );
}

/** The card's number for a screen reader, inside its heading after the title: "Nummer 3 på fotot", or "Nummer 3, inte utpekad på fotot". */
export function PhotoNumberText({ number, pointed = true }: { number: number; pointed?: boolean }) {
  return <span className="sr-only"> {pointed ? photoNumberText(number) : notPointedText(number)}</span>;
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
      closeLabel="Klar"
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

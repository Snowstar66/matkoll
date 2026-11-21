"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/components/cx";
import { CloseIcon } from "@/components/icons";
import { markerPosition, photoMarkerClasses, type MarkerTone } from "@/components/photo-marker";
import { numbersHiddenHint, PhotoNumbersToggle, useHiddenNumbers } from "@/components/photo-numbers-toggle";
import { Sheet } from "@/components/sheet";
import type { Location } from "@/features/catalog";
import type { ImageSize } from "@/lib/images";
import { analyzedPhotoErrorText, analyzedPhotoTitle } from "../domain/pantry-suggestion";
import { spreadMarkers } from "../domain/photo-numbers";
import {
  backToOverviewLabel,
  legendFor,
  overviewHint,
  photoMarkerName,
  photoStatusText,
  zoomedHint,
  type PhotoMarkerStatus,
  type PhotoViewMarker,
} from "../domain/photo-view";
import { backToOverview, openView, restoreView, selectNumber, type ViewSnapshot } from "../domain/photo-view-state";
import { scrollToTap } from "../domain/photo-zoom";

// Enhetlig fotovisning (Matvaror): the one photo view, opened from "Senaste
// foto" and from a row or "Ändra vara". The overview shows the whole photo
// with every number on it and a small legend. A tap on a number zooms in on
// it (the photo at a larger size inside its own frame, the number larger with
// a ring, the others faded) and a fixed line under the photo names it: number,
// name and status, so the item is never covered. A tap on the photo goes back
// to the overview exactly as it was (the zoom and the sheet's scroll position
// are stored when zooming starts, photo-view-state.ts). Another number can be
// tapped while zoomed in. Numbers are buttons ("Vara 3: Grädde, finns inte
// längre"); a cross or a dashed ring says what became of an item, and the line
// under the photo says it in words, so nothing rests on colour alone.

/** The nearest ancestor that scrolls (the sheet's body), or `null`. */
function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent);
    if (/(auto|scroll)/.test(`${overflowX} ${overflowY}`)) return parent;
  }
  return null;
}

const toneOf: Record<PhotoMarkerStatus, MarkerTone> = { present: "on", gone: "gone", skipped: "skipped" };

/** The marker's tone: accent unless its item is gone or was never added. */
function toneFor(status: PhotoMarkerStatus | null): MarkerTone {
  return status ? toneOf[status] : "on";
}

/** What is inside a marker: its number, or a cross when its item is gone. */
function MarkerFace({ marker }: { marker: Pick<PhotoViewMarker, "n" | "status"> }) {
  return marker.status === "gone" ? <CloseIcon size={12} /> : <>{marker.n}</>;
}

/** The ring around the lit marker, in the colour of what it stands for. */
const litClasses: Record<PhotoMarkerStatus | "none", string> = {
  none: "shadow-(--marker-lit)",
  present: "shadow-(--marker-lit)",
  gone: "shadow-[0_0_0_5px_color-mix(in_srgb,var(--danger)_40%,transparent),0_2px_8px_rgb(0_0_0/0.4)]",
  skipped: "shadow-[0_0_0_5px_color-mix(in_srgb,var(--marker-off)_60%,transparent),0_2px_8px_rgb(0_0_0/0.4)]",
};

/** How many times the photo's own width it is zoomed to at least, when its pixels are fewer than that. */
const minZoom = 2;
/** The photo's height in the overview, as a share of the screen. */
const overviewScreenShare = 0.6;

export type PhotoViewerProps = {
  open: boolean;
  /** "Klar". */
  onClose: () => void;
  /** The photo's address and its size when known (it lays out the frame before the photo is decoded). */
  photo: { url: string; size: ImageSize | null };
  /** The place the photo shows: the sheet's title is "Fotot av kylen". Förrådet gives `title` instead. */
  location?: Location;
  /** The sheet's title when it is not about a place ("Kortet"). */
  title?: string;
  /** What a number stands for, said to a screen reader: "Vara 3: …", "Föremål 3: …". */
  noun?: string;
  /** The numbers on the photo with their names and statuses. */
  markers: readonly PhotoViewMarker[];
  /** The line under the title in the overview; "Tryck på en siffra …" when not given. */
  subtitle?: string;
  /** Opens zoomed in on this number (a row's camera, the crop in "Ändra vara"); the overview when `null` or not on the photo. */
  initialNumber?: number | null;
  /** Numbers that are not the lit one are dark grey, as on Förråd's card page (Matvaror's are green). Only for markers without a status. */
  quietMarkers?: boolean;
  /** The photo's alt text. */
  alt: string;
  /** What is said when the photo cannot be shown. */
  errorText?: string;
  /** The photo cannot be shown. */
  onPhotoError?: () => void;
  /** Under the photo (the overview's legend comes first): "Ta bort fotot". */
  children?: ReactNode;
};

/**
 * The photo view, as a sheet. Key it on the photo and on how many times it
 * was opened, so every opening starts fresh.
 */
export function PhotoViewer({
  open,
  onClose,
  photo,
  location,
  title: givenTitle,
  noun = "Vara",
  markers,
  subtitle,
  initialNumber = null,
  quietMarkers = false,
  alt,
  errorText = analyzedPhotoErrorText,
  onPhotoError,
  children,
}: PhotoViewerProps) {
  const title = givenTitle ?? (location ? analyzedPhotoTitle(location) : "Fotot");
  const [hidden, setHidden] = useHiddenNumbers();
  const [failed, setFailed] = useState(false);
  const [decoded, setDecoded] = useState<ImageSize | null>(null);
  const [view, setView] = useState(() => openView(initialNumber !== null && markers.some((marker) => marker.n === initialNumber) ? initialNumber : null));
  const boxRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  /** The overview to put back once the overview has laid out again. */
  const restoreRef = useRef<ViewSnapshot | null>(null);

  const size = decoded ?? photo.size;
  const zoomed = view.selected !== null;
  const ratio = size ? size.width / size.height : null;

  // The frame in pixels as it is now: its width decides how far apart the markers must be.
  let frame: { width: number; height: number } | null = null;
  if (size && ratio) {
    const available = boxWidth ?? size.width;
    const width = zoomed
      ? Math.max(size.width, minZoom * available)
      : Math.min(available, (typeof window === "undefined" ? Infinity : window.innerHeight * overviewScreenShare) * ratio);
    frame = { width, height: width / ratio };
  }
  const shown = decoded && frame ? spreadMarkers(markers, frame) : [...markers];
  const selectedMarker = zoomed ? (shown.find((marker) => marker.n === view.selected) ?? null) : null;

  // The box's width, to lay the frame out in pixels (zoomed in, the frame is larger than the box).
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    setBoxWidth(box.clientWidth || null);
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => setBoxWidth(box.clientWidth || null));
    observer.observe(box);
    return () => observer.disconnect();
  }, [failed]);

  // Back at the overview: the zoom is gone, and the sheet's scroll position is as it was before zooming.
  useLayoutEffect(() => {
    if (view.selected !== null || !restoreRef.current) return;
    const snapshot = restoreRef.current;
    restoreRef.current = null;
    if (frameRef.current) restoreView(scrollParentOf(frameRef.current), snapshot);
  }, [view.selected]);

  // Zoomed in: the chosen number in the middle of the frame (where the photo allows it), and the frame in view.
  const centreOn = selectedMarker && frame ? { left: selectedMarker.left, top: selectedMarker.top, width: frame.width, height: frame.height } : null;
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !centreOn) return;
    const target = scrollToTap(
      { fx: centreOn.left / 100, fy: centreOn.top / 100 },
      { left: 0, top: 0, width: centreOn.width, height: centreOn.height },
      { width: viewport.clientWidth, height: viewport.clientHeight },
    );
    viewport.scrollLeft = target.left;
    viewport.scrollTop = target.top;
    // Only when the number or the frame's size changes, never on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.selected, centreOn?.width, centreOn?.height, centreOn?.left, centreOn?.top]);

  useLayoutEffect(() => {
    if (view.selected !== null) viewportRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [view.selected]);

  function choose(number: number) {
    const scroller = frameRef.current ? scrollParentOf(frameRef.current) : null;
    setView((current) => selectNumber(current, number, scroller));
  }

  function back() {
    const next = backToOverview(view);
    restoreRef.current = next.restore;
    setView(next.view);
  }

  // The overview can be shown without its numbers (a switch above the photo); zoomed in, the number tapped is always there.
  const numbersHidden = hidden && !zoomed;
  const legend = zoomed || numbersHidden ? [] : legendFor(markers);
  const frameStyle = frame
    ? zoomed
      ? { width: frame.width, height: frame.height }
      : { aspectRatio: `${size!.width} / ${size!.height}`, width: `min(100%, calc(${overviewScreenShare * 100}dvh * ${size!.width} / ${size!.height}))` }
    : { width: "100%" };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={zoomed ? zoomedHint : numbersHidden ? numbersHiddenHint : (subtitle ?? overviewHint)}
      closeLabel="Klar"
    >
      {/* Mounted empty, so VoiceOver says the text when the photo fails. */}
      <div role="status">{failed ? <p className="text-body text-ink-2">{errorText}</p> : null}</div>
      {failed ? null : (
        <div ref={boxRef} data-testid="photo-viewer" data-zoomed={zoomed || undefined} className="flex flex-col gap-3">
          {zoomed || markers.length === 0 ? null : (
            // Next to the photo: the whole photo without the numbers on top of it, and back.
            <div className="-mb-1 flex justify-end">
              <PhotoNumbersToggle hidden={hidden} onChange={setHidden} className="-mr-2" />
            </div>
          )}
          <div
            ref={viewportRef}
            data-testid="photo-viewer-viewport"
            className={cx(
              "relative rounded-[14px] bg-photo-stage",
              zoomed ? "h-[min(52dvh,400px)] overflow-auto overscroll-contain" : "overflow-hidden",
            )}
          >
            <div ref={frameRef} data-testid="pantry-photo-frame" style={frameStyle} className={cx("relative", !zoomed && "mx-auto")}>
              {/* A plain <img>: the photo is private, served by the route handler or an object URL, which next/image cannot optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={alt}
                width={size?.width}
                height={size?.height}
                draggable={false}
                onLoad={(event) => {
                  const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                  if (width > 0 && height > 0) setDecoded({ width, height });
                }}
                onError={() => {
                  setFailed(true);
                  onPhotoError?.();
                }}
                className={cx("pointer-events-none block max-w-none object-contain", size ? "size-full" : "h-auto w-full")}
              />
              {zoomed ? (
                // A tap on the photo (not on a number) goes back to the overview.
                <button
                  type="button"
                  data-testid="photo-viewer-back"
                  aria-label={backToOverviewLabel(title)}
                  onClick={back}
                  className="absolute inset-0 cursor-zoom-out -outline-offset-2"
                />
              ) : null}
              {decoded && !numbersHidden
                ? shown.map((marker) => {
                    const lit = view.selected === marker.n;
                    return (
                      <button
                        key={marker.n}
                        type="button"
                        aria-label={photoMarkerName(marker, noun)}
                        aria-pressed={zoomed ? lit : undefined}
                        data-testid="photo-viewer-marker"
                        data-status={marker.status ?? undefined}
                        style={markerPosition(marker.left, marker.top)}
                        onClick={() => choose(marker.n)}
                        className={cx(
                          photoMarkerClasses(!lit && quietMarkers && marker.status === null ? "off" : toneFor(marker.status)),
                          "absolute -translate-x-1/2 -translate-y-1/2 transition-[scale,opacity,box-shadow] duration-200 motion-reduce:transition-none",
                          // A 44 px tap area around the 22 px marker (the inset is measured from inside its 2 px border).
                          "before:absolute before:-inset-[13px] before:content-['']",
                          lit ? cx("z-20 scale-140", litClasses[marker.status ?? "none"]) : "z-10",
                          zoomed && !lit && "opacity-40",
                        )}
                      >
                        <MarkerFace marker={marker} />
                      </button>
                    );
                  })
                : null}
            </div>
          </div>
          {/* The fixed line under the photo when zoomed in: number, name and status, so the item itself is never covered. */}
          <div role="status" data-testid="photo-viewer-name">
            {selectedMarker ? (
              <div className="flex min-h-[60px] items-center gap-3 rounded-[12px] border border-border px-3.5 py-2.5">
                <span
                  aria-hidden="true"
                  className={cx(photoMarkerClasses(toneFor(selectedMarker.status)), "scale-110", selectedMarker.status === "skipped" && "opacity-100")}
                >
                  <MarkerFace marker={selectedMarker} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-row-title font-semibold wrap-break-word text-ink">
                    <span className="sr-only">{noun} {selectedMarker.n}: </span>
                    {selectedMarker.name}
                  </span>
                  {selectedMarker.status ? (
                    <span
                      data-testid="photo-viewer-status"
                      className={cx(
                        "text-meta font-medium",
                        selectedMarker.status === "gone" ? "text-danger" : "text-ink-2",
                        selectedMarker.status === "skipped" && "italic",
                      )}
                    >
                      {photoStatusText(selectedMarker)}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>
          {legend.length > 0 ? (
            <ul role="list" data-testid="photo-viewer-legend" className="flex flex-wrap gap-x-4 gap-y-1.5 text-meta text-ink-2">
              {legend.map((entry) => {
                // A real marker of that kind as the sample, so the legend looks like what it explains.
                const sample = markers.find((marker) => marker.status === entry.status);
                return (
                  <li key={entry.status} className="inline-flex items-center gap-1.5">
                    {sample ? (
                      <span aria-hidden="true" className={photoMarkerClasses(toneOf[entry.status])}>
                        <MarkerFace marker={sample} />
                      </span>
                    ) : null}
                    {entry.text}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}
      {children}
    </Sheet>
  );
}

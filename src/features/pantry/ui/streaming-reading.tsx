"use client";

import { useEffect, useState } from "react";
import type { ImageSize } from "@/lib/images";

// Kylfoto C: "raderna droppar in". While a photo is read by a model that
// streams, the camera area shows the photo with a number popping up on it
// for every item as it is read, and the items as rows that fade in under it,
// with grey placeholder rows to show that more is coming and "4 hittills"
// above them. All of it is only motion-safe: with "Minska rörelse" the rows
// and numbers just appear. The photo is an object URL made here from the
// kept photo, in this browser's memory only (AD-15), and revoked when it is
// no longer shown.

/** What the reading has so far, numbered as in the review (the numbers go on over several photos). */
export type StreamingReadingView = {
  /** The photo being read; its markers are the points of its own items. */
  photo: { image: Blob; size: ImageSize | null } | null;
  /** The items of this photo read so far, with their numbers. */
  rows: readonly { n: number; label: string }[];
  /** Markers on the photo: the item's number and its point in percent of the photo. */
  markers: readonly { n: number; left: number; top: number }[];
  /** How many items the whole reading has found (every photo of it). */
  soFar: number;
};

/** "4 hittills", under "Hittar varorna …". */
export function foundSoFarText(count: number): string {
  return `${count} hittills`;
}

/** How many grey rows show that more is coming. */
const placeholderRows = 2;

/** The photo's object URL while it is shown. */
function usePhotoUrl(image: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image || typeof URL.createObjectURL !== "function") return;
    const made = URL.createObjectURL(image);
    let current = true;
    // After the effect body, so the render that follows is not a cascade of this one.
    queueMicrotask(() => {
      if (current) setUrl(made);
    });
    return () => {
      current = false;
      URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [image]);
  return url;
}

export function StreamingReading({ view }: { view: StreamingReadingView }) {
  const { photo, rows, markers, soFar } = view;
  const url = usePhotoUrl(photo?.image ?? null);
  const size = photo?.size ?? null;
  return (
    <div data-testid="pantry-streaming" className="flex flex-col gap-3">
      {url && size ? (
        <div className="flex justify-center rounded-[16px] bg-photo-stage">
          <div className="relative max-h-[260px]" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- an object URL of the photo in memory */}
            <img src={url} alt="" className="h-full max-h-[260px] w-auto rounded-[16px] object-contain opacity-90" />
            {markers.map((marker) => (
              <span
                key={marker.n}
                aria-hidden="true"
                data-testid="pantry-streaming-marker"
                style={{ left: `${marker.left}%`, top: `${marker.top}%`, transform: "translate(-50%, -50%)" }}
                className="absolute inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-marker-edge bg-accent px-[5px] text-[12px] leading-none font-semibold text-on-accent motion-safe:animate-marker-pop"
              >
                {marker.n}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {soFar > 0 ? (
        <p data-testid="pantry-streaming-count" className="text-meta text-ink-2">
          {foundSoFarText(soFar)}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul aria-label="Varorna hittills" className="flex flex-col overflow-hidden rounded-lg bg-surface">
          {rows.map((row) => (
            <li
              key={row.n}
              data-testid="pantry-streaming-row"
              className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 text-body text-ink last:border-b-0 motion-safe:animate-row-in"
            >
              <span
                aria-hidden="true"
                className="inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border px-1 text-badge leading-none text-ink-2"
              >
                {row.n}
              </span>
              <span className="min-w-0 truncate">{row.label}</span>
            </li>
          ))}
          {Array.from({ length: placeholderRows }, (_, index) => (
            <li
              key={`more-${index}`}
              aria-hidden="true"
              data-testid="pantry-streaming-placeholder"
              className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 last:border-b-0"
            >
              <span className="h-5 w-5 shrink-0 rounded-full bg-hairline motion-safe:animate-pulse" />
              <span className="h-3 w-2/5 rounded-full bg-hairline motion-safe:animate-pulse" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

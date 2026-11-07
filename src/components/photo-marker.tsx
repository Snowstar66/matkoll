import { cx } from "@/components/cx";

// The numbered marker on a photo, shared by Kylfoto (the review photo) and
// Förrådet (a card's föremål), so both look the same: 22 px, filled, with a
// white edge (dark in dark mode) and a shadow. Presentational only.

export type MarkerTone = "on" | "off" | "unsure";

/** Half a marker and its border, at 200 % text: a marker is kept this far inside the photo's edges. */
export const markerInset = "14px";

const toneClasses = {
  on: "bg-accent text-on-accent",
  off: "bg-marker-off text-photo-mark",
  unsure: "bg-warm text-on-warm",
} as const;

/**
 * A marker's classes: accent when it is lit or its row is ticked, dark grey
 * when not, warm when unsure and not ticked.
 */
export function photoMarkerClasses(tone: MarkerTone) {
  return cx(
    "inline-flex shrink-0 items-center justify-center rounded-full text-badge leading-none",
    "min-h-[22px] min-w-[22px] border-2 border-marker-edge px-[5px] text-[12px] font-semibold shadow-(--marker-shadow)",
    toneClasses[tone],
  );
}

/** A marker's place on the photo in percent, kept markerInset inside the photo's edges. */
export function markerPosition(left: number, top: number) {
  return {
    left: `clamp(${markerInset}, ${left}%, calc(100% - ${markerInset}))`,
    top: `clamp(${markerInset}, ${top}%, calc(100% - ${markerInset}))`,
  };
}

/** The same number in a list row, small, in the marker's colours, so the row and its dot on the photo are seen to belong together. Hidden from screen readers: the row's text says it all. */
export function MarkerBadge({ number, tone }: { number: number; tone: MarkerTone }) {
  return (
    <span
      aria-hidden="true"
      data-testid="marker-badge"
      className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] leading-none font-semibold", toneClasses[tone])}
    >
      {number}
    </span>
  );
}

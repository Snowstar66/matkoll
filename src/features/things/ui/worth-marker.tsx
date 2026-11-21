"use client";

import { StarIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";
import {
  worthConfidenceText,
  worthDisclaimerText,
  worthMarkerLabel,
  worthTitleText,
  type ThingWorth,
} from "../domain/thing-worth";

// Värt en titt (Tillval): a small star on a föremål's row, and a quiet block in its sheet. Both only
// show when the switch is on and the föremål has a tip. The star is a shape, not just a colour, and
// it has a name for a screen reader; the words are in the sheet.

/** The star after a föremål's name on a row; nothing without a tip or with the switch off. */
export function WorthMarker({ worth }: { worth: ThingWorth | null | undefined }) {
  const on = useOption("worthLook");
  if (!on || !worth) return null;
  return (
    <span role="img" aria-label={worthMarkerLabel(worth)} title={worthTitleText} data-testid="worth-marker" className="ml-1.5 inline-flex shrink-0 translate-y-[2px] items-center text-warm">
      <StarIcon size={15} />
    </span>
  );
}

/** Under a föremål's name in its sheet: "Värt en titt", the sentence, how sure, and that it is a tip. */
export function WorthBlock({ worth }: { worth: ThingWorth | null | undefined }) {
  const on = useOption("worthLook");
  if (!on || !worth) return null;
  return (
    <section aria-label={worthTitleText} data-testid="worth-block" className="flex flex-col gap-1 rounded-lg bg-bg px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-meta font-semibold text-ink-2">
        <StarIcon size={14} className="shrink-0 text-warm" />
        {worthTitleText}
      </p>
      <p className="text-body text-ink">{worth.why}</p>
      <p className="text-meta text-ink-2">
        <span data-testid="worth-confidence">{worthConfidenceText(worth.confidence)}</span>. {worthDisclaimerText}
      </p>
    </section>
  );
}

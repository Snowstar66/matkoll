"use client";

import { splitDurations } from "../domain/step-timer";
import type { StartTimer } from "./use-step-timers";

/**
 * A step's text where each time ("10 minuter") is a button that starts a timer.
 * The button looks like a link in the accent colour; its tap area is taller than
 * the line (44 px) without making the line taller.
 */
export function StepText({ text, stepKey, label, onStart }: { text: string; stepKey: string; label: string; onStart?: StartTimer }) {
  if (!onStart) return <>{text}</>;
  return (
    <>
      {splitDurations(text).map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          <button
            key={index}
            type="button"
            aria-label={`Starta timer ${part.text}`}
            onClick={() => onStart({ key: `${stepKey}:${index}`, label, seconds: part.seconds })}
            className="relative cursor-pointer text-accent underline underline-offset-2 before:absolute before:-inset-y-3 before:right-0 before:left-0 before:content-['']"
          >
            {part.text}
          </button>
        ),
      )}
    </>
  );
}

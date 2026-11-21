"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/cx";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

// "Dölj siffror" / "Visa siffror": one switch for every photo with numbers on
// it (the photo view in Matvaror and Förråd, the card page in Förråd), so the
// whole photo can be seen without the numbers on top of it. The choice is
// kept in this browser, best effort (it works without storage); the default is
// that the numbers show.

const storageKey = "livskoll:photo-numbers-hidden";

export const hideNumbersText = "Dölj siffror";
export const showNumbersText = "Visa siffror";
export const numbersHiddenHint = "Siffrorna är dolda. Tryck på Visa siffror för att välja bland dem.";

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(storageKey, "1");
    else window.localStorage.removeItem(storageKey);
  } catch {
    // No storage (a private window, blocked site data): the choice lasts until the page is closed.
  }
}

/** Whether the numbers are hidden, and how to change it. The stored choice is read after the first render, so the server and the client agree. */
export function useHiddenNumbers(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    // Reading the browser's storage is the point of this effect; it cannot be done while rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(readHidden());
  }, []);
  return [
    hidden,
    (next) => {
      setHidden(next);
      writeHidden(next);
    },
  ];
}

/** The switch: an eye and its words (the eye alone would not say which way it goes); pressed when the numbers are hidden. */
export function PhotoNumbersToggle({ hidden, onChange, className }: { hidden: boolean; onChange: (hidden: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={hidden}
      data-testid="photo-numbers-toggle"
      onClick={() => onChange(!hidden)}
      className={cx("inline-flex min-h-tap items-center gap-1.5 rounded-md px-2 text-meta font-semibold text-ink-2", className)}
    >
      {hidden ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      {hidden ? showNumbersText : hideNumbersText}
    </button>
  );
}

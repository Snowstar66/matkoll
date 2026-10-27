"use client";

import { useEffect, useState } from "react";
import { msUntilStockholmMidnight, stockholmDayKey } from "../domain/pantry-meta";

/**
 * Now, for "Tillagd idag" and "Tillagd igår" (Story 11.3): a new value at the
 * next midnight in Stockholm, and when the page shows again after it was
 * hidden (another app, or another tab in Matkoll: React Activity runs the
 * effects again) if the day has changed meanwhile. The server's and the
 * browser's first value may differ around midnight, so the text it gives is
 * rendered with `suppressHydrationWarning`.
 */
export function usePantryNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    /** A new value only when the day in Stockholm has changed, so nothing renders for nothing. */
    const refresh = () =>
      setNow((current) => {
        const next = new Date();
        return stockholmDayKey(next) === stockholmDayKey(current) ? current : next;
      });
    // Shown again (Activity): the day may have changed while the page was hidden.
    const shown = setTimeout(refresh, 0);
    // A new value at midnight; on a day the clocks change it may come an hour early, and then again.
    const midnight = setTimeout(() => setNow(new Date()), msUntilStockholmMidnight(now));
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(shown);
      clearTimeout(midnight);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [now]);
  return now;
}

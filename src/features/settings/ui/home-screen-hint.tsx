"use client";

import { useSyncExternalStore } from "react";

// "Lägg Matkoll på hemskärmen" in Inställningar (Story 11.6, AD-27): how to put
// the app on the home screen, shown only when Matkoll is not already running
// from there.

const standaloneQuery = "(display-mode: standalone)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(standaloneQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True when Matkoll runs from the home screen: the manifest's display mode, or iOS's own flag. */
function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia(standaloneQuery).matches;
}

/** Unknown on the server, so nothing is shown until the browser has said. */
function unknownOnServer(): boolean | null {
  return null;
}

export function HomeScreenHint() {
  const standalone = useSyncExternalStore<boolean | null>(subscribe, isStandalone, unknownOnServer);
  if (standalone !== false) return null;
  return (
    <p className="text-body text-ink-2" data-testid="home-screen-hint">
      Lägg Matkoll på hemskärmen: tryck Dela och sedan Lägg till på hemskärmen.
    </p>
  );
}

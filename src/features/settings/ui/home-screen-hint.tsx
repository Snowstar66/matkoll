"use client";

import { useSyncExternalStore } from "react";
import { appName } from "@/app/app-info";

// "Lägg Matkoll på hemskärmen" in Inställningar (Story 11.6, AD-27): how to put
// the app on the home screen, shown only when Matkoll is not already running
// from there. Safari's steps (Dela, Lägg till på hemskärmen) only on iPhone and
// iPad; Android gets the browser menu's words; a computer gets nothing.

const standaloneQuery = "(display-mode: standalone)";

export type Platform = "standalone" | "ios" | "android" | "other";

const texts: Partial<Record<Platform, string>> = {
  ios: `Lägg ${appName} på hemskärmen: tryck Dela och sedan Lägg till på hemskärmen.`,
  android: `Lägg ${appName} på hemskärmen: välj Installera appen i webbläsarens meny.`,
};

export function platformSubscribe(onChange: () => void) {
  const media = window.matchMedia(standaloneQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** iPadOS 13 and later says "Macintosh" but has touch; a Mac has no touch points. */
function isIos(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function platformNow(): Platform {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (iosStandalone || window.matchMedia(standaloneQuery).matches) return "standalone";
  if (isIos()) return "ios";
  if (/Android/.test(navigator.userAgent)) return "android";
  return "other";
}

/** Unknown on the server, so nothing is shown until the browser has said. */
export function platformOnServer(): Platform | null {
  return null;
}

export function HomeScreenHint() {
  const current = useSyncExternalStore<Platform | null>(platformSubscribe, platformNow, platformOnServer);
  const text = current ? texts[current] : undefined;
  if (!text) return null;
  return (
    <p className="text-body text-ink-2" data-testid="home-screen-hint">
      {text}
    </p>
  );
}

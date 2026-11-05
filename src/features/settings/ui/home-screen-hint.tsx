"use client";

import { useSyncExternalStore } from "react";
import { appName } from "@/app/app-info";
import { platformNow, platformOnServer, platformSubscribe, type Platform } from "../platform";

// "Lägg Matkoll på hemskärmen" in Inställningar (Story 11.6, AD-27): how to put
// the app on the home screen, shown only when Matkoll is not already running
// from there. Safari's steps (Dela, Lägg till på hemskärmen) only on iPhone and
// iPad; Android gets the browser menu's words; a computer gets nothing.

const texts: Partial<Record<Platform, string>> = {
  ios: `Lägg ${appName} på hemskärmen: tryck Dela och sedan Lägg till på hemskärmen.`,
  android: `Lägg ${appName} på hemskärmen: välj Installera appen i webbläsarens meny.`,
};

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

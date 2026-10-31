"use client";

import { useSyncExternalStore } from "react";
import { platformNow, platformOnServer, platformSubscribe, type Platform } from "./home-screen-hint";

const texts: Record<Platform, string> = {
  standalone: "Matkoll är redan på hemskärmen och öppnas som en app.",
  ios: "Tryck Dela i Safari och sedan Lägg till på hemskärmen. Då öppnas Matkoll som en app, utan webbläsarens fält.",
  android: "Välj Installera appen i webbläsarens meny. Då öppnas Matkoll som en app, och finns i Dela-menyn när du delar ett recept.",
  other: "På en dator: välj Installera Matkoll i adressfältet eller webbläsarens meny (Chrome och Edge). På en telefon: öppna den här sidan där och följ stegen.",
};

/** "Installera appen" (Story 14.7): how to put Matkoll on the home screen, for the device the page is opened on. */
export function InstallApp() {
  const platform = useSyncExternalStore<Platform | null>(platformSubscribe, platformNow, platformOnServer);
  return (
    <section aria-label="Installera appen" className="flex flex-col gap-3">
      <div className="rounded-lg bg-surface p-4">
        <p className="text-body text-ink-2" data-testid="install-text">
          {platform ? texts[platform] : " "}
        </p>
      </div>
    </section>
  );
}

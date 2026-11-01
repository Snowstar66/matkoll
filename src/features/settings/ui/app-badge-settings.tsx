"use client";

import { useSyncExternalStore, useTransition } from "react";
import { Button } from "@/components/button";
import { appName } from "@/app/app-info";
import { askForBadgePermission, badgeOptedIn, canBadge, notificationState, setBadgeOptIn, showAppBadge } from "@/lib/app-badge";
import { newsClient } from "@/lib/news-client";

// Siffra på appikonen (Story 23.2): a quiet opt-in, per device. Turning it on
// asks for notifications once (iOS shows the icon's number only then) and says
// why; the app sends no notifications.

type BadgeState = { supported: boolean; on: boolean; permission: NotificationPermission | "unsupported" };

const listeners = new Set<() => void>();
let cached: BadgeState | null = null;

function read(): BadgeState {
  const next: BadgeState = { supported: canBadge(), on: badgeOptedIn(), permission: notificationState() };
  if (cached && cached.supported === next.supported && cached.on === next.on && cached.permission === next.permission) return cached;
  cached = next;
  return next;
}

function changed() {
  cached = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The total the tabs show now, for the icon at once. */
function currentTotal(): number {
  const news = newsClient()?.getSnapshot();
  return news ? news.lista.length + news.prylar.length : 0;
}

export function AppBadgeSettings() {
  const state = useSyncExternalStore<BadgeState | null>(subscribe, read, () => null);
  const [pending, startTransition] = useTransition();

  function turnOn() {
    startTransition(async () => {
      await askForBadgePermission();
      setBadgeOptIn(true);
      await showAppBadge(currentTotal());
      changed();
    });
  }

  function turnOff() {
    startTransition(async () => {
      setBadgeOptIn(false);
      await showAppBadge(0);
      changed();
    });
  }

  return (
    <section aria-label="Siffra på appikonen" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
        <p className="text-body text-ink-2">
          Appikonen på hemskärmen visar hur många nya varor och kort andra i hushållet lagt till sedan du tittade senast. Det du själv gör räknas inte.
        </p>
        <p className="text-body text-ink-2">
          På iPhone behöver {appName} få visa notiser för att siffran ska synas. {appName} skickar inga notiser, tillåtelsen gäller bara siffran.
        </p>
        {state === null ? null : !state.supported ? (
          <p className="text-body text-ink-3" data-testid="app-badge-status">
            Den här webbläsaren kan inte visa en siffra. Det fungerar i den installerade appen på iPhone (iOS 16.4 eller senare) och i Chrome och Edge på en dator.
          </p>
        ) : state.on ? (
          <>
            <p className="text-body text-ink" data-testid="app-badge-status">
              {state.permission === "denied"
                ? `Siffran är på, men notiser är avstängda för ${appName}. Slå på dem i telefonens inställningar under Notiser.`
                : "Siffran är på, på den här enheten."}
            </p>
            <Button variant="secondary" onClick={turnOff} disabled={pending} className="self-start">
              Stäng av
            </Button>
          </>
        ) : (
          <Button onClick={turnOn} disabled={pending} className="self-start">
            Slå på siffran
          </Button>
        )}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { appName } from "@/app/app-info";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { Notice } from "@/components/notice";
import { errorMessages } from "@/lib/errors";
import { platformNow, platformOnServer, platformSubscribe, type Platform } from "@/features/settings";
import { savePushPreferences, subscribePush, unsubscribePush } from "../actions/push";
import type { PushPreferenceKind } from "@/lib/push-message";
import { pushChoices, type PushPreferences } from "../domain/push";
import { currentSubscription, notificationPermission, pushSupported, subscribeThisDevice, unsubscribeThisDevice } from "./push-client";

// Inställningar → Notiser (Story 23.3): turn notifications on for this device
// (the browser asks), and choose what to be told about. The choices follow the
// person; the device is the one in the hand.

export type PushSettingsProps = {
  /** The VAPID public key; null while the keys are not set: nothing can be turned on. */
  publicKey: string | null;
  /** What the person has chosen (or the defaults). */
  preferences: PushPreferences;
};

type DeviceState = "checking" | "on" | "off" | "denied" | "unsupported";

export const notSetUpText = "Notiser är inte påslagna än. Det går att slå på dem här så fort de är klara.";

export const iosInstallText = `På iPhone och iPad kan ${appName} skicka notiser först när appen ligger på hemskärmen: tryck Dela i Safari och sedan Lägg till på hemskärmen, och öppna ${appName} därifrån.`;

export function PushSettings({ publicKey, preferences }: PushSettingsProps) {
  const platform = useSyncExternalStore<Platform | null>(platformSubscribe, platformNow, platformOnServer);
  const [device, setDevice] = useState<DeviceState>("checking");
  const [choices, setChoices] = useState(preferences);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let next: DeviceState;
      if (!pushSupported()) next = "unsupported";
      else if (notificationPermission() === "denied") next = "denied";
      else next = (await currentSubscription()) ? "on" : "off";
      if (!cancelled) setDevice(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function turnOn() {
    if (!publicKey) return;
    startTransition(async () => {
      setMessage(null);
      const subscription = await subscribeThisDevice(publicKey);
      if (!subscription) {
        setDevice(notificationPermission() === "denied" ? "denied" : "off");
        return;
      }
      const saved = await subscribePush(subscription);
      if (!saved.ok) {
        await unsubscribeThisDevice();
        setMessage(errorMessages[saved.error.code]);
        return;
      }
      setDevice("on");
    });
  }

  function turnOff() {
    startTransition(async () => {
      setMessage(null);
      const endpoint = await unsubscribeThisDevice();
      if (endpoint) await unsubscribePush(endpoint);
      setDevice("off");
    });
  }

  function choose(kind: PushPreferenceKind, value: boolean) {
    const next = { ...choices, [kind]: value };
    setChoices(next);
    startTransition(async () => {
      const saved = await savePushPreferences(next);
      if (saved.ok) setMessage(null);
      else {
        setChoices(choices);
        setMessage(errorMessages[saved.error.code]);
      }
    });
  }

  const iosInBrowser = platform === "ios" && device === "unsupported";

  return (
    <section aria-label="Notiser" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
        <p className="text-body text-ink-2">
          {appName} kan säga till när någon annan i hushållet gör något. Ändringar som kommer tätt samlas till en notis, och det du själv gör ger ingen notis.
        </p>
        {publicKey === null ? (
          <p className="text-body text-ink" data-testid="push-status">
            {notSetUpText}
          </p>
        ) : iosInBrowser ? (
          <p className="text-body text-ink" data-testid="push-status">
            {iosInstallText}
          </p>
        ) : device === "unsupported" ? (
          <p className="text-body text-ink-3" data-testid="push-status">
            Den här webbläsaren kan inte ta emot notiser.
          </p>
        ) : device === "denied" ? (
          <p className="text-body text-ink" data-testid="push-status">
            Notiser är avstängda för {appName} i webbläsaren eller telefonen. Slå på dem där, under inställningarna för Notiser, och kom tillbaka hit.
          </p>
        ) : device === "on" ? (
          <>
            <p className="text-body text-ink" data-testid="push-status">
              Notiser är på, på den här enheten.
            </p>
            <Button variant="secondary" onClick={turnOff} disabled={pending} className="self-start">
              Stäng av på den här enheten
            </Button>
          </>
        ) : device === "off" ? (
          <Button onClick={turnOn} disabled={pending} className="self-start">
            Slå på notiser
          </Button>
        ) : null}
        {message ? <Notice role="alert">{message}</Notice> : null}
      </div>
      {publicKey !== null && device === "on" ? (
        <div className="flex flex-col rounded-lg bg-surface px-4 py-2" role="group" aria-label="Berätta om">
          {pushChoices.map((choice) => (
            <div key={choice.kind} className="flex items-center gap-3">
              <Checkbox checked={choices[choice.kind]} onCheckedChange={(value) => choose(choice.kind, value)} label={choice.label} describedBy={`push-hint-${choice.kind}`} />
              <span className="flex min-w-0 flex-1 flex-col py-2">
                <span className="text-row-title text-ink">{choice.label}</span>
                <span id={`push-hint-${choice.kind}`} className="text-[0.9375rem] leading-5 text-ink-2">
                  {choice.hint}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

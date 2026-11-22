"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { badgeOptedIn } from "@/lib/app-badge";
import { palettes, readPalette } from "@/lib/palette";

// The short values of the rows that are about this phone (Utseende, Notiser, Siffra på appikonen):
// read on the device when the page has loaded, never on the server. Nothing is written.

/** Which device value a row shows. */
export type DeviceValueKind = "palette" | "push" | "badge";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

function paletteLabel(): string {
  const id = readPalette().palette;
  return palettes.find((palette) => palette.id === id)?.label ?? "Grön";
}

/** Whether this device has a push subscription: false when the browser cannot, or has none. */
export async function pushOnThisDevice(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || typeof window === "undefined" || !("PushManager" in window) || !("Notification" in window)) return false;
    if (Notification.permission === "denied") return false;
    const registration = await navigator.serviceWorker.getRegistration("/");
    return Boolean(await registration?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** The value text of a row ("Grön", "På", "Av"), or undefined until this device has been read. */
export function useDeviceValue(kind: DeviceValueKind | undefined): string | undefined {
  const sync = useSyncExternalStore(
    subscribe,
    () => (kind === "palette" ? paletteLabel() : kind === "badge" ? (badgeOptedIn() ? "På" : "Av") : ""),
    () => "",
  );
  const [push, setPush] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (kind !== "push") return;
    let cancelled = false;
    void pushOnThisDevice().then((on) => {
      if (!cancelled) setPush(on ? "På" : "Av");
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);
  if (kind === "push") return push;
  return sync || undefined;
}

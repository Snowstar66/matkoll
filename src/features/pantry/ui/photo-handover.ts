"use client";

import { useSyncExternalStore } from "react";
import type { Location } from "@/features/catalog";

// Story 20.1: "Fotografera kylen" in the welcome tour opens the camera from the
// tap itself (a browser opens it only inside a tap) and then leads to Matvaror,
// Kyl. The photo is handed over here, in memory, and the camera area of that
// location takes it as if it had been chosen there: it is read like any other
// photo, and nothing is saved before it is confirmed.

type HandedOver = { file: File; location: Location };

let handedOver: HandedOver | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Hands `file` over to the camera area of `location`, which reads it the next time it shows (now, when it does). */
export function handOverPlacePhoto(file: File, location: Location): void {
  handedOver = { file, location };
  notify();
}

/** Takes the handed-over photo if it is for `location`; null otherwise. A photo is taken once. */
export function takeHandedOverPhoto(location: Location): File | null {
  if (!handedOver || handedOver.location !== location) return null;
  const { file } = handedOver;
  handedOver = null;
  notify();
  return file;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The location a photo waits for, or null; changes when one is handed over or taken. */
export function useHandedOverLocation(): Location | null {
  return useSyncExternalStore(
    subscribe,
    () => handedOver?.location ?? null,
    () => null,
  );
}

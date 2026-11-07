"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while the page is open and visible (Screen Wake Lock):
 * the lock is let go when the page is hidden, so it is asked for again when the
 * page shows again, and it is released when the component goes away. Where the
 * browser has no wake lock, or refuses it (low battery), or `enabled` is false
 * (Inställningar → Tillval), nothing happens.
 */
export function useWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.wakeLock) return;
    const wakeLock = navigator.wakeLock;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    async function acquire() {
      if (stopped || document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await wakeLock.request("screen");
        if (stopped) {
          await next.release().catch(() => {});
          return;
        }
        sentinel = next;
      } catch {
        // Refused or not allowed: the screen simply dims as usual.
      }
    }

    const onVisibility = () => void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    void acquire();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}

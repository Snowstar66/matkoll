"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Tänd skärm (FR-21, AD-18): the step mode keeps the screen on with the Screen
// Wake Lock API while it is open.

const neverChanges = () => () => {};
/**
 * TypeScript types navigator.wakeLock as always there, so support is checked
 * with `in`. The server, which has no navigator, says yes: the hook only
 * matters once it is active in the browser.
 */
const isSupported = () => "wakeLock" in navigator;
const supportedOnServer = () => true;
const isVisible = () => document.visibilityState === "visible";

/** Releases a lock and ignores any failure: releasing is cleanup, not an error. */
function release(lock: WakeLockSentinel) {
  try {
    lock.release().catch(() => {});
  } catch {
    // Released already, or a browser that throws: nothing to do.
  }
}

/**
 * Keeps the screen on while `active`: the lock is requested when the hook
 * becomes active, released in the effect's cleanup (when it stops being
 * active or the component goes, also when the page is hidden by a client
 * navigation), and requested again when the page becomes visible, since the
 * browser releases it when the page is hidden. A lock granted after the
 * cleanup is released at once.
 *
 * - The page becoming visible while a request is under way asks again once
 *   that request has settled without a lock.
 * - A request refused while the page is visible makes `unavailable` true; one
 *   refused while it is hidden does not, and the next visibilitychange asks
 *   again. A later request that succeeds clears it.
 * - When the system lets go of the lock while the page is visible (e.g.
 *   battery saving), it asks once more; if that fails, or the system lets go
 *   again before the page is next shown, `unavailable` becomes true.
 * - Without Wake Lock in the browser, `unavailable` is true while active.
 *
 * Nothing is logged: the screen may dim, which is not an error.
 */
export function useWakeLock(active: boolean): { unavailable: boolean } {
  const supported = useSyncExternalStore(neverChanges, isSupported, supportedOnServer);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let disposed = false;
    let requesting = false;
    /** The page became visible while a request was under way. */
    let askAgain = false;
    /** The system has let go of a lock while visible, and one more request was made for it. */
    let retriedAfterRelease = false;
    let lock: WakeLockSentinel | null = null;
    const holding = () => lock !== null && !lock.released;

    async function request() {
      if (disposed || holding()) return;
      if (requesting) {
        askAgain = true;
        return;
      }
      // A hidden page is refused anyway; visibilitychange asks again when it shows.
      if (!isVisible()) return;
      requesting = true;
      askAgain = false;
      try {
        const granted = await navigator.wakeLock.request("screen");
        if (disposed) {
          release(granted);
          return;
        }
        lock = granted;
        granted.addEventListener("release", () => onSystemRelease(granted));
        setRefused(false);
      } catch {
        // Refused while hidden: not a lack of support; the next visibilitychange asks again.
        if (!disposed && isVisible()) setRefused(true);
      } finally {
        requesting = false;
      }
      if (askAgain && !disposed && !holding() && isVisible()) void request();
    }

    function onSystemRelease(released: WakeLockSentinel) {
      if (lock !== released) return;
      lock = null;
      // Our own release in the cleanup, or the browser's when the page is hidden.
      if (disposed || !isVisible()) return;
      if (retriedAfterRelease) {
        setRefused(true);
        return;
      }
      retriedAfterRelease = true;
      void request();
    }

    function onVisibilityChange() {
      if (!isVisible()) return;
      retriedAfterRelease = false;
      void request();
    }

    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const held = lock;
      lock = null;
      if (held !== null) release(held);
      setRefused(false);
    };
  }, [active]);

  return { unavailable: active && (!supported || refused) };
}

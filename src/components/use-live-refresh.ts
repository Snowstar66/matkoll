"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createRefreshScheduler } from "@/lib/refresh-scheduler";

// Story 17.12 (replaces Story 17.7's Realtime socket): a live page reads itself
// again (router.refresh) every few seconds while its tab is visible and the
// browser is online, and at once when the tab is shown again or the connection
// returns. The read is the page's own request with the httpOnly session
// cookies, so no access token ever reaches the browser's JavaScript (docs/
// molnet.md, "Före vänner", point 7). A page nobody has touched for five
// minutes reads itself only once a minute, until the next touch. Quiet by
// design: nothing is shown.

/** Inköpslista: two people in the store see each other's ticks within a few seconds. */
export const listRefreshMs = 4_000;
/** Any other live page. */
export const liveRefreshMs = 10_000;
/** No pointer, key, touch or scroll for this long: the page counts as left open and reads less often. */
export const idleAfterMs = 5 * 60_000;
/** How often a page left open reads itself again (a desktop tab open all day costs Vercel little). */
export const idleRefreshMs = 60_000;
/** What counts as someone using the page. */
const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
/** While this device saves something, a due refresh waits this long and looks again. */
export const busyWaitMs = 300;

export type LiveRefreshOptions = {
  /** How often the page reads itself again while visible and online. */
  intervalMs?: number;
  /** True while this device saves something: a refresh then waits, so its optimistic state never flickers. */
  busy: boolean;
  /** True when the page knows the connection is poor (e.g. queued offline ticks wait): no reads until it is false again. */
  paused?: boolean;
  /**
   * What a read is, when it is not the page's own (router.refresh): Story 24.1's note card
   * reads GET /api/notes on the same pace, without reading the whole page again.
   */
  refresh?: () => void;
};

export function useLiveRefresh({ intervalMs = liveRefreshMs, busy, paused = false, refresh }: LiveRefreshOptions): void {
  const router = useRouter();
  const busyRef = useRef(busy);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    busyRef.current = busy;
    refreshRef.current = refresh;
  }, [busy, refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = Date.now();
    const idle = () => Date.now() - lastActivity >= idleAfterMs;
    const scheduler = createRefreshScheduler({
      delayMs: busyWaitMs,
      isBusy: () => busyRef.current,
      // A read that fails offline would fall back to a full page load (Story 17.8): never try one then.
      refresh: () => {
        if (!navigator.onLine) return;
        if (refreshRef.current) refreshRef.current();
        else router.refresh();
      },
    });

    const active = () => !paused && navigator.onLine && document.visibilityState === "visible";

    function stop() {
      clearTimeout(timer);
      timer = undefined;
      scheduler.cancel();
    }

    /** The next read, `intervalMs` from now (`idleRefreshMs` once nobody has used the page for a while); nothing while hidden, offline or paused. */
    function loop() {
      clearTimeout(timer);
      timer = undefined;
      if (!active()) return;
      timer = setTimeout(() => {
        timer = undefined;
        scheduler.refreshNow();
        loop();
      }, idle() ? Math.max(intervalMs, idleRefreshMs) : intervalMs);
    }

    /** Shown again or back online: read at once for whatever was missed, then keep going. */
    function wake() {
      if (!active()) {
        stop();
        return;
      }
      scheduler.refreshNow();
      loop();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        // Coming back to the tab is someone using it.
        lastActivity = Date.now();
        wake();
      } else stop();
    }

    /** Someone uses the page: after an idle spell, read at once and go back to the normal pace. */
    function onActivity() {
      const wasIdle = idle();
      lastActivity = Date.now();
      if (wasIdle) wake();
    }

    loop();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", wake);
    window.addEventListener("offline", stop);
    for (const type of activityEvents) window.addEventListener(type, onActivity, { capture: true, passive: true });
    return () => {
      for (const type of activityEvents) window.removeEventListener(type, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", stop);
      stop();
    };
  }, [router, intervalMs, paused]);
}

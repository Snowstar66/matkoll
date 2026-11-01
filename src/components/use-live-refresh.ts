"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createRefreshScheduler } from "@/lib/refresh-scheduler";

// Story 17.12 (replaces Story 17.7's Realtime socket): a live page reads itself
// again (router.refresh) every few seconds while its tab is visible and the
// browser is online, and at once when the tab is shown again or the connection
// returns. The read is the page's own request with the httpOnly session
// cookies, so no access token ever reaches the browser's JavaScript (docs/
// molnet.md, "Före vänner", point 7). Quiet by design: nothing is shown.

/** Inköpslista: two people in the store see each other's ticks within a few seconds. */
export const listRefreshMs = 4_000;
/** Any other live page. */
export const liveRefreshMs = 10_000;
/** While this device saves something, a due refresh waits this long and looks again. */
export const busyWaitMs = 300;

export type LiveRefreshOptions = {
  /** How often the page reads itself again while visible and online. */
  intervalMs?: number;
  /** True while this device saves something: a refresh then waits, so its optimistic state never flickers. */
  busy: boolean;
  /** True when the page knows the connection is poor (e.g. queued offline ticks wait): no reads until it is false again. */
  paused?: boolean;
};

export function useLiveRefresh({ intervalMs = liveRefreshMs, busy, paused = false }: LiveRefreshOptions): void {
  const router = useRouter();
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduler = createRefreshScheduler({
      delayMs: busyWaitMs,
      isBusy: () => busyRef.current,
      // A read that fails offline would fall back to a full page load (Story 17.8): never try one then.
      refresh: () => {
        if (navigator.onLine) router.refresh();
      },
    });

    const active = () => !paused && navigator.onLine && document.visibilityState === "visible";

    function stop() {
      clearTimeout(timer);
      timer = undefined;
      scheduler.cancel();
    }

    /** The next read, `intervalMs` from now; nothing while hidden, offline or paused. */
    function loop() {
      clearTimeout(timer);
      timer = undefined;
      if (!active()) return;
      timer = setTimeout(() => {
        timer = undefined;
        scheduler.refreshNow();
        loop();
      }, intervalMs);
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
      if (document.visibilityState === "visible") wake();
      else stop();
    }

    loop();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", wake);
    window.addEventListener("offline", stop);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", stop);
      stop();
    };
  }, [router, intervalMs, paused]);
}

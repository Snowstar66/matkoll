"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { ShoppingLine } from "../domain/compute-list";
import {
  emptyQueue,
  enqueueCheck,
  flushQueue,
  isGone,
  isQueued,
  type QueuedCheck,
  readQueue,
  type SendOutcome,
  subscribeQueue,
} from "./offline-checks";

// Story 17.8: the browser side of the check queue (offline-checks.ts). It
// reports whether the device is offline, keeps the queue, and sends it when
// the connection is back: at start, on `online`, when the tab is shown again,
// and every few seconds while something waits (a weak signal may be "online"
// without carrying a request). The list is read again once checks were saved.

/** How often a waiting queue is tried again while the browser says it is online. */
export const retryQueueMs = 8_000;

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Whether the browser has a connection; true while the page is rendered on the server. */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export type OfflineChecks = {
  /** The checks waiting to be sent, oldest first. */
  queue: readonly QueuedCheck[];
  /** True when the device has no connection or checks wait to be sent: the list says so calmly. */
  offline: boolean;
  /** Whether a tap should be queued rather than sent: no connection, or an older check of the line still waits (keeps the order). */
  shouldQueue: (planId: string | null, key: string) => boolean;
  /** Queues a check and tries to send the queue. */
  enqueue: (change: QueuedCheck) => void;
};

export function useOfflineChecks(
  userId: string | null,
  planId: string | null,
  lines: readonly ShoppingLine[],
  send: (change: QueuedCheck) => Promise<SendOutcome>,
): OfflineChecks {
  const router = useRouter();
  const online = useOnline();
  const queue = useSyncExternalStore(
    subscribeQueue,
    () => readQueue(userId),
    () => emptyQueue,
  );
  const latest = useRef({ userId, planId, lines, send });
  useEffect(() => {
    latest.current = { userId, planId, lines, send };
  });
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    const now = latest.current;
    if (flushing.current || !navigator.onLine || readQueue(now.userId).length === 0) return;
    flushing.current = true;
    try {
      const saved = await flushQueue(
        now.userId,
        (change) => latest.current.send(change),
        (entry) => isGone(entry, latest.current.planId, latest.current.lines),
      );
      if (saved > 0 && navigator.onLine) router.refresh();
    } finally {
      flushing.current = false;
    }
  }, [router]);

  useEffect(() => {
    void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  const waiting = queue.length > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void flush(), retryQueueMs);
    return () => clearInterval(timer);
  }, [waiting, flush]);

  const shouldQueue = useCallback(
    (plan: string | null, key: string) => !navigator.onLine || isQueued(latest.current.userId, plan, key),
    [],
  );
  const enqueue = useCallback(
    (change: QueuedCheck) => {
      enqueueCheck(latest.current.userId, change);
      void flush();
    },
    [flush],
  );

  return { queue, offline: !online || waiting, shouldQueue, enqueue };
}

"use client";

import { type RealtimeChannel, RealtimeClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createRefreshScheduler } from "@/lib/refresh-scheduler";

// Story 17.7: the page listens to Supabase Realtime (`postgres_changes`) on the
// tables it is counted from, filtered on the user's id, and reads itself again
// when another device changes one (router.refresh). RLS still applies to the
// socket: it is opened with the signed-in user's own access token, which
// /api/realtime/session hands out (the session cookies are httpOnly). Quiet by
// design: nothing is shown, and a lost connection is rebuilt without a word.

/** How long events are gathered before the page reads itself again. */
export const refreshDelayMs = 300;
/** A failed token read is tried again after this long. */
const retryMs = 15_000;
/** The token is renewed this long before it expires. */
const renewBeforeMs = 60_000;

type RealtimeSession = { url: string; key: string; userId: string; accessToken: string; expiresAt: number | null };

async function readSession(): Promise<RealtimeSession | null> {
  try {
    const response = await fetch("/api/realtime/session", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok: boolean; data?: RealtimeSession };
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export type LiveRefreshOptions = {
  /** The tables (public schema) whose changes for this user refresh the page. */
  tables: readonly string[];
  /** True while this device saves something: a refresh then waits, so its own echo never flickers the optimistic state. */
  busy: boolean;
};

export function useLiveRefresh({ tables, busy }: LiveRefreshOptions): void {
  const router = useRouter();
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  const tablesKey = tables.join(",");

  useEffect(() => {
    let stopped = false;
    let client: RealtimeClient | null = null;
    let channel: RealtimeChannel | null = null;
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduler = createRefreshScheduler({
      delayMs: refreshDelayMs,
      isBusy: () => busyRef.current,
      refresh: () => router.refresh(),
    });

    function stopListening() {
      clearTimeout(renewTimer);
      if (client && channel) void client.removeChannel(channel);
      void client?.disconnect();
      client = null;
      channel = null;
    }

    async function listen() {
      stopListening();
      const session = await readSession();
      if (stopped) return;
      if (!session) {
        renewTimer = setTimeout(() => void listen(), retryMs);
        return;
      }
      // The realtime socket alone, with the user's token: no auth client, nothing stored.
      const next = new RealtimeClient(`${session.url.replace(/^http/, "ws")}/realtime/v1`, {
        params: { apikey: session.key },
        accessToken: async () => session.accessToken,
      });
      await next.setAuth(session.accessToken);
      if (stopped) return;
      client = next;
      let live = next.channel(`live:${tablesKey}`);
      for (const table of tablesKey.split(",")) {
        live = live.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `user_id=eq.${session.userId}` },
          () => scheduler.notify(),
        );
      }
      channel = live.subscribe();
      // Renew the token before it expires; the socket is rebuilt with the new one.
      const expiresIn = session.expiresAt ? session.expiresAt * 1000 - Date.now() - renewBeforeMs : retryMs;
      renewTimer = setTimeout(() => void listen(), Math.max(expiresIn, retryMs));
    }

    function onVisible() {
      if (document.visibilityState !== "visible") {
        scheduler.cancel();
        return;
      }
      // A phone may have dropped the socket while the tab was hidden: listen
      // again, and read the page once for whatever was missed.
      void listen();
      scheduler.refreshNow();
    }

    void listen();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      scheduler.cancel();
      stopListening();
    };
  }, [router, tablesKey]);
}

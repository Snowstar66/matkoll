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

/** `refused`: signed out or no longer allowed, which a retry never changes. `failed`: try again later. */
async function readSession(): Promise<RealtimeSession | "refused" | "failed"> {
  try {
    const response = await fetch("/api/realtime/session", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) return "refused";
    if (!response.ok) return "failed";
    const body = (await response.json()) as { ok: boolean; data?: RealtimeSession };
    return body.ok && body.data ? body.data : "failed";
  } catch {
    return "failed";
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
      // Offline (Story 17.8) a failed read would fall back to a full page load: wait for the connection.
      refresh: () => {
        if (navigator.onLine) router.refresh();
      },
    });

    function stopListening() {
      clearTimeout(renewTimer);
      if (client && channel) void client.removeChannel(channel);
      void client?.disconnect();
      client = null;
      channel = null;
    }

    /** Each call to listen takes a number; one that is no longer the latest stops after its next await. */
    let generation = 0;
    /** When the token runs out (ms), and whether the socket joined its channel. */
    let tokenEndsAt = 0;
    let joined = false;

    async function listen() {
      generation += 1;
      const mine = generation;
      stopListening();
      const session = await readSession();
      if (stopped || mine !== generation) return;
      if (session === "refused") return;
      if (session === "failed") {
        renewTimer = setTimeout(() => void listen(), retryMs);
        return;
      }
      // The realtime socket alone, with the user's token: no auth client, nothing stored.
      const next = new RealtimeClient(`${session.url.replace(/^http/, "ws")}/realtime/v1`, {
        params: { apikey: session.key },
        accessToken: async () => session.accessToken,
      });
      await next.setAuth(session.accessToken);
      if (stopped || mine !== generation) {
        void next.disconnect();
        return;
      }
      client = next;
      joined = false;
      // Every event is only a ping that something changed: no payload is read.
      // INSERT and UPDATE are filtered on the user and follow RLS. Realtime
      // applies neither to DELETE (its record holds the row id only), so a
      // DELETE is heard without a filter and can only cost one harmless refresh.
      let live = next.channel(`live:${tablesKey}`);
      for (const table of tablesKey.split(",")) {
        const ping = () => scheduler.notify();
        live = live
          .on("postgres_changes", { event: "INSERT", schema: "public", table, filter: `user_id=eq.${session.userId}` }, ping)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: `user_id=eq.${session.userId}` }, ping)
          .on("postgres_changes", { event: "DELETE", schema: "public", table }, ping);
      }
      channel = live.subscribe((status) => {
        joined = mine === generation && status === "SUBSCRIBED";
      });
      // Renew the token before it expires; the socket is rebuilt with the new one.
      tokenEndsAt = session.expiresAt ? session.expiresAt * 1000 : Date.now() + retryMs + renewBeforeMs;
      const expiresIn = tokenEndsAt - Date.now() - renewBeforeMs;
      renewTimer = setTimeout(() => void listen(), Math.max(expiresIn, retryMs));
    }

    function onVisible() {
      if (document.visibilityState !== "visible") {
        scheduler.cancel();
        return;
      }
      // A phone may have dropped the socket while the tab was hidden: listen
      // again unless the socket is joined and its token is good for a while,
      // and read the page once for whatever was missed.
      if (!(joined && client?.isConnected() && tokenEndsAt - Date.now() > 2 * renewBeforeMs)) void listen();
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

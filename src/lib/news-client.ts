"use client";

import { useSyncExternalStore } from "react";
import {
  newsAnswerSchema,
  newsQuery,
  newsTabs,
  noteOwn,
  othersNews,
  parseLastSeen,
  parseOwn,
  type LastSeen,
  type NewsTab,
  type OwnChanges,
} from "./news";

// The client's side of Brickor (Story 23.1): this device's "last seen" per tab
// and its own recent changes, both in localStorage, and the news the server
// lists after last seen, less the own changes. The state is shared by every
// component through useNews() (useSyncExternalStore). The shell's NewsWatcher
// says which tab is open and when to read again.
//
// Own changes: every place that writes news on this device notes its key
// (noteOwnNews) before or as it saves: the ticked line's key, the own item's
// id, the card's photo id. Only a short hash is kept, for a day. Besides,
// last seen moves on while a tab is open and as it is left, so a change made
// on the tab itself is before last seen anyway.

const seenStorageKey = "livskoll.news.seen";
const ownStorageKey = "livskoll.news.own";

export type NewsSnapshot = Readonly<Record<NewsTab, readonly string[]>>;

const emptySnapshot: NewsSnapshot = { lista: [], prylar: [] };

/** What the client needs from the browser, so it can be tried without one. */
export type NewsEnv = {
  fetch: typeof fetch;
  now: () => number;
  /** localStorage, or null when it cannot be used (a private window, blocked storage). */
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
};

export type NewsClient = ReturnType<typeof createNewsClient>;

export function createNewsClient(env: NewsEnv) {
  let snapshot: NewsSnapshot = emptySnapshot;
  const listeners = new Set<() => void>();
  /** Server time minus this device's time, from the last answer, so last seen is in the server's time. */
  let skewMs = 0;
  let current: NewsTab | null = null;
  /** Counts each tab's "seen", so an answer asked for before it never brings old news back. */
  const seenCount: Record<NewsTab, number> = { lista: 0, prylar: 0 };
  let reads = 0;
  let applied = 0;

  const lastSeen = (): LastSeen => parseLastSeen(env.read(seenStorageKey));
  const own = (): OwnChanges => parseOwn(env.read(ownStorageKey));

  function emit() {
    for (const listener of listeners) listener();
  }

  function setTab(tab: NewsTab, keys: readonly string[]) {
    if (snapshot[tab].length === 0 && keys.length === 0) return;
    snapshot = { ...snapshot, [tab]: keys };
  }

  function storeSeen(tab: NewsTab, at: number) {
    env.write(seenStorageKey, JSON.stringify({ ...lastSeen(), [tab]: at }));
  }

  /** The tab has been looked at now: last seen moves to now, and its badge goes. */
  function markSeen(tab: NewsTab) {
    seenCount[tab] += 1;
    storeSeen(tab, env.now() + skewMs);
    setTab(tab, []);
    emit();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,

    /** The tab now open (null for any other page). The tab left and the tab opened both count as seen. */
    setCurrent(tab: NewsTab | null) {
      const left = current;
      current = tab;
      if (left !== null && left !== tab) markSeen(left);
      if (tab !== null) markSeen(tab);
    },

    /** The page is hidden or closed while a tab is open: what it showed has been seen. */
    leave() {
      if (current !== null) markSeen(current);
    },

    /** This device has made a change with the news key `key`: it never counts here. */
    noteOwn(key: string) {
      const next = noteOwn(own(), key, env.now());
      env.write(ownStorageKey, JSON.stringify(next));
      for (const tab of newsTabs) setTab(tab, othersNews(snapshot[tab], next));
      emit();
    },

    /** Reads the news after each tab's last seen. A failure keeps what is shown. */
    async refresh(): Promise<void> {
      const read = ++reads;
      const seen = lastSeen();
      const asked = { ...seenCount };
      let answer;
      try {
        const response = await env.fetch(`/api/news?${newsQuery(seen)}`, { cache: "no-store" });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const parsed = newsAnswerSchema.safeParse((body as { data?: unknown } | null)?.data);
        if (!parsed.success) return;
        answer = parsed.data;
      } catch {
        return;
      }
      if (read < applied) return;
      applied = read;
      const serverNow = Date.parse(answer.now);
      if (Number.isFinite(serverNow)) skewMs = serverNow - env.now();
      const mine = own();
      for (const tab of newsTabs) {
        // A tab never seen here starts now: what was there before is not news.
        if (seen[tab] === undefined && lastSeen()[tab] === undefined && Number.isFinite(serverNow)) storeSeen(tab, serverNow);
        if (tab === current) {
          if (Number.isFinite(serverNow)) storeSeen(tab, serverNow);
          setTab(tab, []);
        } else if (asked[tab] === seenCount[tab]) {
          setTab(tab, othersNews(answer.news[tab], mine));
        }
      }
      emit();
    },
  };
}

function browserEnv(): NewsEnv {
  return {
    fetch: (...args) => window.fetch(...args),
    now: () => Date.now(),
    read: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write: (key, value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // No storage (a private window, blocked site data): the badges just start over.
      }
    },
  };
}

let shared: NewsClient | null = null;

/** The one client of this page; null on the server. */
export function newsClient(): NewsClient | null {
  if (typeof window === "undefined") return null;
  shared ??= createNewsClient(browserEnv());
  return shared;
}

/** Notes a change this device made (a ticked line, an own item, a card), so it never counts as news here. */
export function noteOwnNews(key: string): void {
  newsClient()?.noteOwn(key);
}

const noSubscribe = () => () => {};

/** Each tab's news from someone else since this device last looked; nothing on the server. */
export function useNews(): NewsSnapshot {
  const client = newsClient();
  return useSyncExternalStore(client?.subscribe ?? noSubscribe, client?.getSnapshot ?? (() => emptySnapshot), () => emptySnapshot);
}

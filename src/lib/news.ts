import { z } from "zod";

// Brickor (Story 23.1): what is new on a tab since this device last looked,
// made by someone else. Per device, so it works with the household's shared
// login: "last seen" and the device's own changes live in this browser's
// localStorage, the server only lists what was added after a time. Pure, so
// the counting is tried without a browser.

/** The tabs that get a badge for news: Inköpslista and Förråd. */
export const newsTabs = ["lista", "prylar"] as const;
export type NewsTab = (typeof newsTabs)[number];

/** The most rows of one kind the server lists; the badge says "9+" long before. */
export const maxNewsRows = 50;

/** How far back the server looks at most, so a device away for months asks for little. */
export const maxNewsAgeMs = 30 * 24 * 60 * 60_000;

/** How long an own change is remembered: long after any poll has seen it. */
export const ownChangeTtlMs = 24 * 60 * 60_000;

/** The most own changes kept; the oldest go first. */
export const maxOwnChanges = 300;

/**
 * The key of one piece of news: a custom item (`item:<id>`), a ticked line
 * (`check:<line key>`) or a card (`card:<photo id>`). The same key is noted
 * when this device makes the change, so the two can be matched.
 */
export const newsKey = {
  item: (id: string) => `item:${id}`,
  check: (lineKey: string) => `check:${lineKey}`,
  card: (photoId: string) => `card:${photoId}`,
} as const;

/** GET /api/news?lista=<iso>&prylar=<iso>: the server's time, and the keys of each tab's news after its time. */
export const newsAnswerSchema = z.object({
  now: z.string(),
  news: z.object({ lista: z.array(z.string()), prylar: z.array(z.string()) }),
});
export type NewsAnswer = z.infer<typeof newsAnswerSchema>;

/**
 * A short hash of a key (FNV-1a, 32 bit), which is what the own changes keep:
 * a ticked line's key holds the food's name, which never needs to be stored.
 */
export function hashKey(key: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Own changes: hash of the key → when it was made (ms). */
export type OwnChanges = Readonly<Record<string, number>>;

/** `own` with `key` noted at `now`, without what is older than a day, and at most maxOwnChanges. */
export function noteOwn(own: OwnChanges, key: string, now: number): OwnChanges {
  const kept = Object.entries({ ...own, [hashKey(key)]: now })
    .filter(([, at]) => now - at < ownChangeTtlMs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxOwnChanges);
  return Object.fromEntries(kept);
}

/** The news keys that someone else made: those this device did not note as its own. */
export function othersNews(keys: readonly string[], own: OwnChanges): string[] {
  return [...new Set(keys)].filter((key) => own[hashKey(key)] === undefined);
}

/** Last seen per tab, as the server's time in ms; a tab without one has never been looked at here. */
export type LastSeen = Partial<Record<NewsTab, number>>;

/** Reads a stored value of last seen; anything unreadable is nothing. */
export function parseLastSeen(raw: string | null): LastSeen {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return {};
    const seen: LastSeen = {};
    for (const tab of newsTabs) {
      const at = (value as Record<string, unknown>)[tab];
      if (typeof at === "number" && Number.isFinite(at)) seen[tab] = at;
    }
    return seen;
  } catch {
    return {};
  }
}

/** Reads stored own changes; anything unreadable is nothing. */
export function parseOwn(raw: string | null): OwnChanges {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
  } catch {
    return {};
  }
}

/** The query of GET /api/news: each tab's last seen as an ISO time, and none for a tab never seen here. */
export function newsQuery(seen: LastSeen): string {
  const params = new URLSearchParams();
  for (const tab of newsTabs) {
    const at = seen[tab];
    if (at !== undefined) params.set(tab, new Date(at).toISOString());
  }
  return params.toString();
}

/** The time the server reads from: `since`, but never more than maxNewsAgeMs before `now`; null when there is none. */
export function sinceFor(raw: string | null, now: Date): Date | null {
  if (raw === null) return null;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return null;
  return new Date(Math.max(at.getTime(), now.getTime() - maxNewsAgeMs));
}

/** The tab a path belongs to, for badges: /lista and below, /prylar and below. */
export function newsTabOf(pathname: string | null): NewsTab | null {
  if (pathname === null) return null;
  for (const tab of newsTabs) {
    if (pathname === `/${tab}` || pathname.startsWith(`/${tab}/`)) return tab;
  }
  return null;
}

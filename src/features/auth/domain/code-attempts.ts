// The app's own limit on wrong login codes (Story 11.6, AD-3). Supabase limits
// code checks per IP, but every check comes from the Next server, so they all
// share the server's IP; this limit counts per address and client IP before
// Supabase is asked.
//
// In memory, per server instance: a new instance (a cold start on Vercel, a
// restart) starts from zero, and parallel instances each count on their own.
// A limit kept in the database would need a function that `anon` may call
// (open question in docs/oppna-fragor.md).

/** Wrong codes allowed per address and client IP within the window. */
export const maxFailedCodes = 5;
/** How long the count lasts from the first wrong code. */
export const failedCodeWindowMs = 15 * 60 * 1000;
/** The most keys kept; the oldest go first, so a flood cannot fill the memory. */
export const maxTrackedKeys = 10_000;

type Entry = { failures: number; resetAt: number };

export type CodeAttempts = {
  /** True when `key` has used up its wrong codes and the window is still open. */
  isBlocked(key: string, now?: number): boolean;
  /** Counts a wrong code for `key`; the window starts at the first. */
  recordFailure(key: string, now?: number): void;
  /** Forgets `key`, after a sign-in that worked. */
  reset(key: string): void;
  /** Number of keys kept, for tests. */
  size(): number;
};

export function createCodeAttempts({
  max = maxFailedCodes,
  windowMs = failedCodeWindowMs,
  maxKeys = maxTrackedKeys,
}: { max?: number; windowMs?: number; maxKeys?: number } = {}): CodeAttempts {
  const entries = new Map<string, Entry>();

  function current(key: string, now: number): Entry | undefined {
    const entry = entries.get(key);
    if (entry && entry.resetAt <= now) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function prune(now: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
    // Map keeps insertion order: the first keys are the oldest windows.
    for (const key of entries.keys()) {
      if (entries.size < maxKeys) break;
      entries.delete(key);
    }
  }

  return {
    isBlocked(key, now = Date.now()) {
      return (current(key, now)?.failures ?? 0) >= max;
    },
    recordFailure(key, now = Date.now()) {
      const entry = current(key, now);
      if (entry) {
        entry.failures += 1;
        return;
      }
      if (entries.size >= maxKeys) prune(now);
      entries.set(key, { failures: 1, resetAt: now + windowMs });
    },
    reset(key) {
      entries.delete(key);
    },
    size() {
      return entries.size;
    },
  };
}

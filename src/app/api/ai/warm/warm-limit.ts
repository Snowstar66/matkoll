import type { WarmUpKind } from "@/server/ai";

// The server's limit on warm-ups (Story 12.2): the same user and kind are
// woken at most once in warmIntervalMs, in this server process, as the client
// asks (src/lib/ai-client.ts). A second server instance has its own.

/** The same user and kind are woken at most once in this time. */
export const warmIntervalMs = 5 * 60_000;

/** When each user last woke each kind (`${userId}:${kind}` → Date.now()). */
const lastWarmed = new Map<string, number>();

/**
 * True, and remembered, when `userId` may wake `kind` now: not within
 * warmIntervalMs of the last time. A warm-up that found LM Studio off counts
 * too, so a sleeping Mac is not asked on every view.
 */
export function claimWarmUp(userId: string, kind: WarmUpKind, now: number = Date.now()): boolean {
  // Old entries go, so the map never grows with time.
  for (const [key, at] of lastWarmed) if (now - at >= warmIntervalMs) lastWarmed.delete(key);
  const key = `${userId}:${kind}`;
  if (lastWarmed.has(key)) return false;
  lastWarmed.set(key, now);
  return true;
}

/** Forgets every warm-up, for tests. */
export function resetWarmUps(): void {
  lastWarmed.clear();
}

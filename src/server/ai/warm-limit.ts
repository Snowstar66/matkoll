import "server-only";

// The server's limit on warm-ups (Story 12.2): a user's model is woken at
// most once in warmIntervalMs, and never within warmIntervalMs of a real AI
// call of the user's, which has just woken it anyway. The key is the model
// (AiService.warmUpKey), so the photo and the text flows, which wake the same
// LM Studio model, share one limit.
//
// Best effort: the maps live in this server process. A second server
// instance (Vercel may run several, and a new one starts empty) has its own,
// so a warm-up may now and then run twice or right after a real call. That
// costs one token on Pontus's Mac and nothing else. Shared state comes with
// the AI jobs in Postgres (Story 12.4).

/**
 * Three minutes: the model on Pontus's Mac is cold again after about five
 * minutes without calls (12.1), so a limit of five would let it cool before
 * the next warm-up is allowed. The client asks no more often (src/lib/ai-client.ts).
 */
export const warmIntervalMs = 3 * 60_000;

/** When each user last woke each model (`${userId} ${modelKey}` → Date.now()). */
const lastWarmed = new Map<string, number>();
/** When each user's last real AI call finished (userId → Date.now()). */
const lastUsed = new Map<string, number>();

function prune(map: Map<string, number>, now: number): void {
  for (const [key, at] of map) if (now - at >= warmIntervalMs) map.delete(key);
}

/**
 * A real AI call of the user's has finished (an analysis, a lookup of the
 * numbers, AI-förslag): the model is warm, so no warm-up for warmIntervalMs.
 */
export function noteAiUsed(userId: string, now: number = Date.now()): void {
  prune(lastUsed, now);
  lastUsed.set(userId, now);
}

/**
 * True, and remembered, when `userId` may wake the model `modelKey` now: not
 * within warmIntervalMs of the last warm-up of it, nor of a real AI call. A
 * warm-up that then finds LM Studio off counts too, so a sleeping Mac is not
 * asked on every view.
 */
export function claimWarmUp(userId: string, modelKey: string, now: number = Date.now()): boolean {
  prune(lastWarmed, now);
  prune(lastUsed, now);
  if (lastUsed.has(userId)) return false;
  const key = `${userId} ${modelKey}`;
  if (lastWarmed.has(key)) return false;
  lastWarmed.set(key, now);
  return true;
}

/** Forgets every warm-up and real call, for tests. */
export function resetWarmUps(): void {
  lastWarmed.clear();
  lastUsed.clear();
}

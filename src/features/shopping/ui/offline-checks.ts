import { checkChangeSchema, type CheckChange } from "../domain/check";
import type { ShoppingLine } from "../domain/compute-list";

// Story 17.8: Handla med dålig täckning. A check that cannot reach the server
// (no signal in a store basement, or no answer in time) is kept in this
// browser and sent when the connection is back. The server's set_shopping_check
// is idempotent and the last state per line wins, so the queue holds one entry
// per line (a newer tap replaces the older), in the order the lines were last
// tapped. Kept in localStorage per user, with memory as the fallback when
// storage is blocked (a private window). Scope: checks only; adding or
// removing items still needs a connection.

/** A check waiting to be sent. */
export type QueuedCheck = CheckChange;

/** A line's check on a plan; the optimistic state, the taps and the queue are kept per plan ("own": a week without a plan). */
export const checkId = (planId: string | null, key: string) => `${planId ?? "own"} ${key}`;

const noQueue: readonly QueuedCheck[] = [];
const storagePrefix = "matkoll:offline-checks:";

/** The queue per user, as last read or written; the snapshot React reads, so it only changes with the queue. */
const queues = new Map<string, readonly QueuedCheck[]>();
const listeners = new Set<() => void>();

const keyOf = (userId: string | null) => `${storagePrefix}${userId ?? "anon"}`;

function parse(raw: string | null): readonly QueuedCheck[] {
  if (!raw) return noQueue;
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return noQueue;
    const valid = list.flatMap((item) => {
      const parsed = checkChangeSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    return valid.length > 0 ? valid : noQueue;
  } catch {
    return noQueue;
  }
}

function load(userId: string | null): readonly QueuedCheck[] {
  if (userId === null || typeof window === "undefined") return noQueue;
  try {
    return parse(window.localStorage.getItem(keyOf(userId)));
  } catch {
    return noQueue;
  }
}

/** The queued checks of `userId` (`null`: this tab only, nothing stored). The same array until the queue changes. */
export function readQueue(userId: string | null): readonly QueuedCheck[] {
  const key = keyOf(userId);
  let queue = queues.get(key);
  if (!queue) {
    queue = load(userId);
    queues.set(key, queue);
  }
  return queue;
}

function writeQueue(userId: string | null, queue: readonly QueuedCheck[]): void {
  const next = queue.length > 0 ? queue : noQueue;
  queues.set(keyOf(userId), next);
  if (userId !== null && typeof window !== "undefined") {
    try {
      if (next.length > 0) window.localStorage.setItem(keyOf(userId), JSON.stringify(next));
      else window.localStorage.removeItem(keyOf(userId));
    } catch {
      // Storage is blocked or full: the queue lives in memory until the tab closes.
    }
  }
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore; another tab's change (the storage event) is read again. */
export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(storagePrefix)) {
      queues.clear();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const emptyQueue = noQueue;

/** `queue` with `change` last; an earlier check of the same line is replaced (the last state wins). */
export function withCheck(queue: readonly QueuedCheck[], change: QueuedCheck): QueuedCheck[] {
  const id = checkId(change.planId, change.key);
  return [...queue.filter((entry) => checkId(entry.planId, entry.key) !== id), change];
}

/** Queues a check for `userId`. */
export function enqueueCheck(userId: string | null, change: QueuedCheck): void {
  writeQueue(userId, withCheck(readQueue(userId), change));
}

/** Whether the line has a check waiting. */
export function isQueued(userId: string | null, planId: string | null, key: string): boolean {
  const id = checkId(planId, key);
  return readQueue(userId).some((entry) => checkId(entry.planId, entry.key) === id);
}

/** The lines of the plan the list shows, with the queued checks on top of what the server says. */
export function mergeQueued(lines: readonly ShoppingLine[], queue: readonly QueuedCheck[], planId: string | null): readonly ShoppingLine[] {
  const wanted = new Map(queue.filter((entry) => entry.planId === planId).map((entry) => [entry.key, entry.checked]));
  if (wanted.size === 0) return lines;
  return lines.map((line) => {
    const checked = wanted.get(line.key);
    return checked === undefined || checked === line.checked ? line : { ...line, checked };
  });
}

/** Whether a queued check is of a line the plan's list no longer has: it is dropped quietly. */
export function isGone(entry: QueuedCheck, planId: string | null, lines: readonly ShoppingLine[]): boolean {
  return entry.planId === planId && !lines.some((line) => line.key === entry.key);
}

/** What happened to a sent check: `saved`, `dropped` (the server will never take it) or `retry` (try again later). */
export type SendOutcome = "saved" | "dropped" | "retry";

/** The server's answer to a check as an outcome; `lost` is no answer at all. */
export function outcomeOf(answer: { ok: true } | { ok: false; code: string } | "lost"): SendOutcome {
  if (answer === "lost") return "retry";
  if (answer.ok) return "saved";
  // A plan that changed or a check that fails validation never succeeds; a failed save or a session may.
  return answer.code === "unauthorized" || answer.code === "shopping_check_failed" ? "retry" : "dropped";
}

/**
 * Sends the queue in order, one at a time. An entry is removed once sent or
 * dropped (only that exact entry: a newer tap of the line made meanwhile stays
 * and goes next). Stops at the first `retry`. Returns how many were saved.
 */
export async function flushQueue(
  userId: string | null,
  send: (change: QueuedCheck) => Promise<SendOutcome>,
  gone: (entry: QueuedCheck) => boolean,
): Promise<number> {
  let saved = 0;
  for (;;) {
    const entry = readQueue(userId)[0];
    if (!entry) return saved;
    const outcome = gone(entry) ? "dropped" : await send(entry);
    if (outcome === "retry") return saved;
    if (outcome === "saved") saved += 1;
    writeQueue(
      userId,
      readQueue(userId).filter((queued) => queued !== entry),
    );
  }
}

/** Forgets what is held in memory (for tests). */
export function resetQueues(): void {
  queues.clear();
  listeners.clear();
}

// "Visa sidtider" (Tillval, Felsökning): how long a switch of tab takes on this device, measured where it is felt: from the tap
// on a tab to the page's content being there. The page marks itself ready with <PageReady> when its content has arrived
// (the tab bar's static frame shows at once; the content waits for the server, which is what is measured). Plain module
// state, so it is tested without a browser; nothing is sent anywhere, and nothing runs with the option off.

export type NavTiming = {
  name: string;
  /** Milliseconds from the tap to the route being shown (the frame with the skeleton). */
  committedMs: number | null;
  /** Milliseconds from the tap to the content being there. */
  readyMs: number;
};

type Pending = { path: string; startedAt: number; committedAt: number | null };

let pending: Pending | null = null;
let latest: NavTiming | null = null;
const history: NavTiming[] = [];
const listeners = new Set<() => void>();

const changed = () => {
  for (const listener of listeners) listener();
};

export function subscribeNavTiming(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const latestNavTiming = (): NavTiming | null => latest;
export const navTimingHistory = (): readonly NavTiming[] => history;

/** A tap on a link to `path` (a pathname): the clock starts. A tap on the page one is already on starts nothing. */
export function noteTap(path: string, currentPath: string, now: number = performance.now()): void {
  if (path === currentPath) return;
  pending = { path, startedAt: now, committedAt: null };
}

/** The route changed to `path`: the frame is there (the content may still be on its way). */
export function noteCommitted(path: string, now: number = performance.now()): void {
  if (pending && pending.path === path && pending.committedAt === null) pending.committedAt = now;
}

/** The page at `path` has its content: the result of the switch it was waiting for, or `null` when it was not one. */
export function noteReady(name: string, path: string, now: number = performance.now()): NavTiming | null {
  if (!pending || pending.path !== path) return null;
  const result: NavTiming = {
    name,
    committedMs: pending.committedAt === null ? null : Math.round(pending.committedAt - pending.startedAt),
    readyMs: Math.round(now - pending.startedAt),
  };
  pending = null;
  latest = result;
  history.push(result);
  if (history.length > 20) history.shift();
  changed();
  return result;
}

/** "Recept 412 ms (ramen efter 38 ms)". */
export function timingText(timing: NavTiming): string {
  const frame = timing.committedMs === null ? "" : ` (ramen efter ${timing.committedMs} ms)`;
  return `${timing.name} ${timing.readyMs} ms${frame}`;
}

/** For tests: forgets everything. */
export function resetNavTiming(): void {
  pending = null;
  latest = null;
  history.length = 0;
  changed();
}

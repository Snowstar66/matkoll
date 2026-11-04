"use client";

import { useEffect, useSyncExternalStore } from "react";
import { hasNewsSince } from "../domain/news-seen";

// What this device saw last of Nyheter, in localStorage: the dot on the Nyheter row
// and the page that clears it. The menu stays beside the page from 1024 px, so the
// dot listens for the page's write as well as for other tabs'.

const storageKey = "livskoll:nyheter-sedd";
const changeEvent = "livskoll:nyheter-sedd";

/** The date seen last, null for never, undefined when storage cannot be read. */
function readSeen(): string | null | undefined {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return undefined;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}

/** Whether there is news this device has not seen; never on the server. */
export function useHasNews(latest: string): boolean {
  const seen = useSyncExternalStore(subscribe, readSeen, () => undefined);
  return hasNewsSince(latest, seen);
}

/** Remembers that this device has seen everything up to `latest`. */
export function markNewsSeen(latest: string): void {
  const seen = readSeen();
  if (seen === undefined || (seen !== null && seen >= latest)) return;
  try {
    window.localStorage.setItem(storageKey, latest);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(changeEvent));
}

/** On the Nyheter page: opening it clears the dot. */
export function MarkNewsSeen({ latest }: { latest: string }) {
  useEffect(() => markNewsSeen(latest), [latest]);
  return null;
}

/** The small accent dot on the Nyheter row while there is something new. */
export function NewsDot({ latest }: { latest: string }) {
  const show = useHasNews(latest);
  if (!show) return null;
  return (
    <span data-testid="news-dot" className="size-2.5 shrink-0 rounded-full bg-accent">
      <span className="sr-only">Nytt</span>
    </span>
  );
}

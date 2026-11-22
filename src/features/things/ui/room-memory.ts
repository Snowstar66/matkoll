"use client";

import { useEffect } from "react";

// Tillbaka to a room keeps what was open there (Förråd flow sketches, C1; Pontus 22 Nov): the photos that were unfolded and
// the scroll position. Held in memory only (this tab, until it is reloaded): no storage key, nothing on the device or the
// server. Only a way back (the browser's Back, or "Tillbaka" in history) brings it again; a room opened from the list
// starts at the top with every photo folded, as before.

const unfolded = new Map<string, ReadonlySet<string>>();
const scrolled = new Map<string, number>();
let cameBack = false;
let armed = false;

/** Listens once for the way into a page: a step back in history is a "Tillbaka"; any tap on the page after it is not. */
function arm() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  window.addEventListener("popstate", () => {
    cameBack = true;
  });
  document.addEventListener(
    "click",
    () => {
      cameBack = false;
    },
    true,
  );
}

export const roomMemoryKey = (siteId: string, roomKey: string) => `${siteId}|${roomKey}`;

/** The photos that were unfolded when the user left this room, when the user is back from a page opened out of it. */
export function recallUnfolded(key: string): ReadonlySet<string> {
  arm();
  return cameBack ? new Set(unfolded.get(key) ?? []) : new Set();
}

export function rememberUnfolded(key: string, ids: ReadonlySet<string>): void {
  unfolded.set(key, new Set(ids));
}

/**
 * Remembers the room's scroll position when a tap leaves it, and puts it back when the user comes back. The page may
 * not be tall enough yet (the rows are read after it mounts), so it tries for a couple of seconds.
 */
export function useRoomScroll(key: string): void {
  useEffect(() => {
    arm();
    const remember = () => scrolled.set(key, window.scrollY);
    // Before the tap navigates: the new page resets the scroll, so it cannot be read later.
    document.addEventListener("click", remember, true);

    const wanted = cameBack ? (scrolled.get(key) ?? 0) : 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (wanted > 0) {
      let tries = 0;
      const attempt = () => {
        const room = document.documentElement.scrollHeight - window.innerHeight;
        if (room >= wanted || tries >= 25) window.scrollTo(0, Math.min(wanted, Math.max(room, 0)));
        else {
          tries += 1;
          timer = setTimeout(attempt, 100);
        }
      };
      attempt();
    }
    return () => {
      document.removeEventListener("click", remember, true);
      if (timer) clearTimeout(timer);
    };
  }, [key]);
}

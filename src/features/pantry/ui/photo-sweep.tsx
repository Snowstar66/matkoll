"use client";

import { startTransition, useEffect, useRef } from "react";
import { sweepPlacePhotos } from "../actions/sweep-place-photos";
import { photoSweepMaxRounds } from "../domain/photo-sweep";

/** The sessionStorage key that says the sweep is not tried again in this session. */
export const photoSweepSkipKey = "matkoll.photoSweep.skip";

function skipped(): boolean {
  try {
    return window.sessionStorage.getItem(photoSweepSkipKey) === "1";
  } catch {
    return false;
  }
}

function skipFromNowOn(): void {
  try {
    window.sessionStorage.setItem(photoSweepSkipKey, "1");
  } catch {
    // No storage (private mode, blocked): the next view tries again.
  }
}

/**
 * The sweep of the latest photos (Story 10.3, FR-39): Förråd renders
 * this only when it has photos older than 30 days, and it calls the Server
 * Action sweepPlacePhotos once per view, again while the answer says more
 * remain (a full batch), at most photoSweepMaxRounds times. Nothing is shown,
 * for any answer: an old photo is never shown anyway.
 *
 * A sweep that removed nothing, failed or never answered (offline) is not
 * tried again in this session (sessionStorage), so a photo whose file cannot
 * be removed never makes every view call the server. When something went,
 * the action revalidates Förråd, which then no longer renders this.
 *
 * Once per view: a call under way is not started again (React's StrictMode
 * runs the effect twice).
 */
export function PhotoSweep() {
  const running = useRef(false);

  useEffect(() => {
    if (running.current || skipped()) return;
    running.current = true;
    startTransition(async () => {
      try {
        for (let round = 0; round < photoSweepMaxRounds; round += 1) {
          const result = await sweepPlacePhotos();
          if (!result.ok || result.data.removed === 0) {
            skipFromNowOn();
            return;
          }
          if (!result.data.more) return;
        }
      } catch {
        skipFromNowOn();
      } finally {
        running.current = false;
      }
    });
  }, []);

  return null;
}

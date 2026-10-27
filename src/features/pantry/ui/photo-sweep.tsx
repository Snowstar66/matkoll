"use client";

import { startTransition, useEffect, useRef } from "react";
import { sweepPlacePhotos } from "../actions/sweep-place-photos";

/**
 * The sweep of the latest photos (Story 10.3, FR-39): Hemma renders this
 * only when needsPlacePhotoSweep said there is something to sweep, and it
 * calls the Server Action sweepPlacePhotos once per view. Nothing is shown,
 * for any answer: an old photo is never shown anyway, and a sweep that
 * failed is tried again the next time Hemma is shown. When something went,
 * the action revalidates Hemma, which then no longer renders this.
 *
 * Once per view: a call under way is not started again (React's StrictMode
 * runs the effect twice), and the effect runs again only when Hemma is shown
 * again after being hidden (Activity) while there is still something to
 * sweep, such as the rest of 150 files.
 */
export function PhotoSweep() {
  const running = useRef(false);

  useEffect(() => {
    if (running.current) return;
    running.current = true;
    startTransition(async () => {
      try {
        await sweepPlacePhotos();
      } catch {
        // Offline or a lost answer: the next view tries again.
      } finally {
        running.current = false;
      }
    });
  }, []);

  return null;
}

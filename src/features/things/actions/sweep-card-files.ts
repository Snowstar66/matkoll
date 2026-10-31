import "server-only";
import { loadCardFileOrphansIn, removeCardFiles } from "../data/photos";
import { ThingsDataError, type ThingsDb } from "../data/client";

// The sweep of the card files (Story 18.2, like the pantry's photo sweep of
// Story 10.3, AD-26): a file that has no thing_photo row is one whose removal
// failed (a replaced card, a deleted boende) or whose save was cut off. It is
// removed with the Storage API. Not a Server Action: the callers hold the
// session client, so the bucket's policies keep it to the user's own files.

/** How old a file without a row must be: a card being saved has its file before its row. */
export const cardFileOrphanMinAgeMs = 10 * 60_000;

/** The most files one sweep removes. */
export const cardFileSweepBatch = 100;

/**
 * Removes the user's card files that have no row, at most 100 per call.
 * Never throws; logs only a reason (`things_photo_remove_failed`), never a path.
 * Returns how many files went.
 */
export async function sweepCardFilesIn(
  db: ThingsDb,
  userId: string,
  { now = new Date(), minAgeMs = cardFileOrphanMinAgeMs }: { now?: Date; minAgeMs?: number } = {},
): Promise<number> {
  try {
    const orphans = await loadCardFileOrphansIn(db, userId, now, minAgeMs, cardFileSweepBatch);
    if (orphans.length === 0) return 0;
    const { failed } = await removeCardFiles(db, orphans);
    if (failed !== null) {
      console.error("things_photo_remove_failed", { reason: failed });
      return 0;
    }
    return orphans.length;
  } catch (error) {
    console.error("things_photo_remove_failed", { reason: error instanceof ThingsDataError ? error.detail : "sweep_threw" });
    return 0;
  }
}

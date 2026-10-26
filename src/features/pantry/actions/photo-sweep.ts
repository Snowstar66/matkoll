import "server-only";
import { PantryDataError, type PantryDb } from "../data/client";
import {
  deletePlacePhotoRowsIn,
  loadExpiredPlacePhotosIn,
  loadPlacePhotoOrphansIn,
  removePlacePhotoFiles,
} from "../data/photos";
import { photoOrphanMinAgeMs, photoSweepBatchSize, placePhotoExpiredBefore } from "../domain/photo-sweep";

// The sweep of the latest photos (Story 10.3, FR-39, AD-26), shared by the
// Server Action sweepPlacePhotos (started by Hemma) and savePlacePhoto (after
// a save). Not a Server Action itself: it takes the session client, so the
// bucket's policies and RLS keep it to the user's own rows and files (AD-4).
// Files are removed with the Storage API only, never with SQL. Nothing here
// logs: the callers log the reason, never a path.

/** What a sweep did: how many photos and files went, and why it stopped early, if it did. */
export type PhotoSweepOutcome = {
  /** Rows of photos older than 30 days deleted, and files without a row removed. */
  removed: number;
  /** PantryDataError's detail when a step failed; what was removed before it stays removed. */
  failed: string | null;
};

export type PhotoSweepOptions = {
  now?: Date;
  /** How old a file without a row must be; photoOrphanMinAgeMs except in tests. */
  orphanMinAgeMs?: number;
};

/**
 * Sweeps the signed-in user's photos, at most photoSweepBatchSize (100)
 * files per call, so a second call takes the rest:
 *
 * 1. Photos taken more than 30 days before `now`: their files are removed
 *    first, then their rows. When the files cannot be removed, the rows stay
 *    (they are never shown) and the next sweep tries again.
 * 2. Files without a row that are older than 10 minutes (pantry_photo_orphans):
 *    a deleted place's or a replaced photo's file that could not be removed,
 *    or a save that was cut off. A save in progress keeps its file.
 *
 * Idempotent: a file or row that is gone already is not counted.
 */
export async function sweepPlacePhotosIn(
  db: PantryDb,
  { now = new Date(), orphanMinAgeMs = photoOrphanMinAgeMs }: PhotoSweepOptions = {},
): Promise<PhotoSweepOutcome> {
  let removed = 0;
  try {
    const expired = await loadExpiredPlacePhotosIn(db, placePhotoExpiredBefore(now), photoSweepBatchSize);
    if (expired.length > 0) {
      await removePlacePhotoFiles(
        db,
        expired.map((photo) => photo.objectPath),
      );
      removed += await deletePlacePhotoRowsIn(
        db,
        expired.map((photo) => photo.id),
      );
    }
    const room = photoSweepBatchSize - expired.length;
    if (room > 0) {
      const orphans = (await loadPlacePhotoOrphansIn(db, orphanMinAgeMs)).slice(0, room);
      removed += await removePlacePhotoFiles(db, orphans);
    }
    return { removed, failed: null };
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    return { removed, failed: error.detail };
  }
}

/**
 * Whether the signed-in user has something to sweep: a photo taken more than
 * 30 days before `now`, or a file without a row that is older than 10
 * minutes. Only reads (AD-2). Throws PantryDataError.
 */
export async function placePhotosNeedSweepIn(db: PantryDb, now: Date = new Date()): Promise<boolean> {
  const [expired, orphans] = await Promise.all([
    loadExpiredPlacePhotosIn(db, placePhotoExpiredBefore(now), 1),
    loadPlacePhotoOrphansIn(db, photoOrphanMinAgeMs),
  ]);
  return expired.length > 0 || orphans.length > 0;
}

import "server-only";
import { PantryDataError, type PantryDb } from "../data/client";
import {
  deleteExpiredPlacePhotoRowsIn,
  loadExpiredPlacePhotosIn,
  loadPlacePhotoOrphansIn,
  removePlacePhotoFiles,
} from "../data/photos";
import { photoOrphanMinAgeMs, photoSweepBatchSize, placePhotoExpiredBefore } from "../domain/photo-sweep";

// The sweep of the latest photos (Story 10.3, FR-39, AD-26), shared by the
// Server Action sweepPlacePhotos (started by Förråd) and savePlacePhoto
// (after a save). Not a Server Action itself: it takes the session client, so
// the bucket's policies and RLS keep it to the user's own rows and files
// (AD-4). Files are removed with the Storage API only, never with SQL.
// Nothing here logs: the callers log the reason, never a path.

/** PhotoSweepOutcome's `failed` when a step removed fewer files or rows than it chose. */
export const photoSweepPartial = "remove_partial";

/** What a sweep did: how many photos and files went, whether more remain, and why it fell short, if it did. */
export type PhotoSweepOutcome = {
  /** Rows of photos older than 30 days deleted, and files without a row removed. */
  removed: number;
  /** A step took a full batch, so more may remain for another call. */
  more: boolean;
  /**
   * The first reason a step fell short: PantryDataError's detail, or
   * photoSweepPartial when fewer were removed than chosen. What was removed
   * stays removed.
   */
  failed: string | null;
};

export type PhotoSweepOptions = {
  now?: Date;
  /** How old a file without a row must be; photoOrphanMinAgeMs except in tests. */
  orphanMinAgeMs?: number;
};

/**
 * Sweeps the signed-in user's photos, at most photoSweepBatchSize (100)
 * files per call, so another call takes the rest (`more`):
 *
 * 1. Photos taken more than 30 days before `now`: their files are removed
 *    first, then the rows whose files are gone (delete_expired_pantry_photos,
 *    which also keeps a row replaced since it was read). A row whose file
 *    could not be removed stays (it is never shown), and the next sweep tries
 *    again.
 * 2. Files without a row that are older than 10 minutes (pantry_photo_orphans):
 *    a deleted place's or a replaced photo's file that could not be removed,
 *    or a save that was cut off. A save in progress keeps its file. This step
 *    runs also when the first one failed.
 *
 * Idempotent: a file or row that is gone already is not counted.
 */
export async function sweepPlacePhotosIn(
  db: PantryDb,
  { now = new Date(), orphanMinAgeMs = photoOrphanMinAgeMs }: PhotoSweepOptions = {},
): Promise<PhotoSweepOutcome> {
  let removed = 0;
  let more = false;
  let failed: string | null = null;
  const fallShort = (reason: string) => {
    failed ??= reason;
  };

  let chosen = 0;
  try {
    const before = placePhotoExpiredBefore(now);
    const expired = await loadExpiredPlacePhotosIn(db, before, photoSweepBatchSize);
    chosen = expired.length;
    more ||= expired.length >= photoSweepBatchSize;
    if (expired.length > 0) {
      const files = await removePlacePhotoFiles(
        db,
        expired.map((photo) => photo.objectPath),
      );
      if (files.failed !== null) fallShort(files.failed);
      const deleted = await deleteExpiredPlacePhotoRowsIn(
        db,
        expired.map((photo) => photo.id),
        before,
      );
      removed += deleted.length;
      if (deleted.length < expired.length) fallShort(photoSweepPartial);
    }
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    fallShort(error.detail);
  }

  try {
    const room = photoSweepBatchSize - chosen;
    if (room > 0) {
      const found = await loadPlacePhotoOrphansIn(db, orphanMinAgeMs);
      const orphans = found.slice(0, room);
      more ||= found.length > room || found.length >= photoSweepBatchSize;
      const files = await removePlacePhotoFiles(db, orphans);
      removed += files.removed.length;
      if (files.failed !== null) fallShort(files.failed);
      else if (files.removed.length < orphans.length) fallShort(photoSweepPartial);
    }
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    fallShort(error.detail);
  }

  return { removed, more: more && failed === null, failed };
}

/**
 * Whether the signed-in user has a photo taken more than 30 days before
 * `now`, which Förråd then has swept. Only reads (AD-2), and only the
 * user's few rows of pantry_photo: the scan for files without a row is left
 * to the sweep itself, which every save runs too. Throws PantryDataError.
 */
export async function placePhotosNeedSweepIn(db: PantryDb, now: Date = new Date()): Promise<boolean> {
  const expired = await loadExpiredPlacePhotosIn(db, placePhotoExpiredBefore(now), 1);
  return expired.length > 0;
}

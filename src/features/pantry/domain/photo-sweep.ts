// The sweep of the latest photos (Story 10.3, FR-39, AD-26): a photo older
// than 30 days is never shown and is removed, row and file, and a file in the
// user's own folder of the bucket without a row (left by a deleted place, a
// replaced photo whose file could not be removed, or a save that was cut off)
// is removed too. The sweep runs as the signed-in user, so it never reaches
// another user's folder, and so never the files of a user deleted outside
// `pnpm users:sync --prune`: users:sync removes those (scripts/). Matvaror
// starts the sweep when there are photos older than 30 days, and every save
// runs it afterwards; there is no scheduled job (AD-4, AD-14). Pure, so it is
// tested without Supabase, and safe in a client component.

/** How old a photo may be, in days, before it is never shown and is swept (FR-39). */
export const placePhotoMaxAgeDays = 30;

const dayMs = 24 * 60 * 60 * 1000;

/**
 * The longest a save may take from its upload to its row's commit: the route
 * POST /api/pantry/photo has `maxDuration` 60 (seconds), and the database
 * stops a statement of the `authenticated` role after 8 seconds
 * (statement_timeout). A test locks the route's value to this one.
 */
export const placePhotoSaveDeadlineMs = 60_000 + 8_000;

/**
 * How old a file without a row must be before the sweep takes it: far longer
 * than placePhotoSaveDeadlineMs, so a file whose save is still under way (its
 * row not yet written) is never taken, and save_pantry_photo never writes a
 * row for a file the sweep removed.
 */
export const photoOrphanMinAgeMs = 10 * 60 * 1000;

/** The most files one sweep removes, and the most names Storage's remove() is given at once. */
export const photoSweepBatchSize = 100;

/** The most sweeps one view of Matvaror starts, while each removed a full batch and more remain. */
export const photoSweepMaxRounds = 5;

/** The time before which a photo was taken that is too old to be shown: `now` less 30 days. */
export function placePhotoExpiredBefore(now: Date): Date {
  return new Date(now.getTime() - placePhotoMaxAgeDays * dayMs);
}

/** A duration as a Postgres interval, in whole seconds (never negative). */
export function intervalOf(ms: number): string {
  return `${Math.max(0, Math.floor(ms / 1000))} seconds`;
}

/** `items` in batches of at most `size`, in order. */
export function inBatches<T>(items: readonly T[], size = photoSweepBatchSize): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) batches.push(items.slice(start, start + size));
  return batches;
}

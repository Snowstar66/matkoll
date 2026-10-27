// The sweep of the latest photos (Story 10.3, FR-39, AD-26): a photo older
// than 30 days is never shown and is removed, row and file, and a file in the
// bucket without a row (left by a deleted place or user, a replaced photo
// whose file could not be removed, or a save that was cut off) is removed
// too. Hemma starts the sweep when there is something to sweep, and every
// save runs it afterwards; there is no scheduled job (AD-4, AD-14). Pure, so
// it is tested without Supabase.

/** How old a photo may be, in days, before it is never shown and is swept (FR-39). */
export const placePhotoMaxAgeDays = 30;

const dayMs = 24 * 60 * 60 * 1000;

/** How old a file without a row must be before the sweep takes it: a save in progress keeps its file. */
export const photoOrphanMinAgeMs = 10 * 60 * 1000;

/** The most files one sweep removes, and the most names Storage's remove() is given at once. */
export const photoSweepBatchSize = 100;

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

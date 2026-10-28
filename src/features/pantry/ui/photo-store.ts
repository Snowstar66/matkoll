import type { Location } from "@/features/catalog";
import type { ImageSize } from "@/lib/images";
import type { PhotoSite } from "../domain/site";

// The photos of the AI jobs of photos (Story 12.5, AD-15, AD-26), held in this
// tab's memory and nowhere else: a plain module variable, so a photo outlives
// the page Hemma while Pontus is in Recept, and goes with a reload (the
// browser's memory is gone then). Never localStorage, sessionStorage,
// IndexedDB, a cache or the address. A photo is kept per job, until its
// result is closed (release) or photoKeepMs has passed, whichever is first.
// Reading the review, "Försök igen" and the latest photo (Story 10.1) need it;
// without it the cards work all the same.

/**
 * A resized photo, the location it shows, the place (pantry_site) Hemma
 * showed when it was taken (Story 8.4, so "Försök igen" is for the same
 * place), its size in pixels when it can be read from the file, and when it
 * was taken (Story 10.1).
 */
export type KeptPhoto = { image: Blob; location: Location; site: PhotoSite; size: ImageSize | null; takenAt: Date };

/** A photo is kept this long, if its result is not closed before (30 minutes). */
export const photoKeepMs = 30 * 60_000;

const photos = new Map<string, { photo: KeptPhoto; keptAt: number }>();

function sweep(now: number): void {
  for (const [id, { keptAt }] of photos) if (now - keptAt >= photoKeepMs) photos.delete(id);
}

/** Keeps the photo of a job. */
export function keepPhoto(jobId: string, photo: KeptPhoto, now: number = Date.now()): void {
  sweep(now);
  photos.set(jobId, { photo, keptAt: now });
}

/** The photo of a job, or `null` when it was released, is older than photoKeepMs or never was here (a reload). */
export function keptPhoto(jobId: string, now: number = Date.now()): KeptPhoto | null {
  sweep(now);
  return photos.get(jobId)?.photo ?? null;
}

/** The result of the job is closed: its photo is let go. */
export function releasePhoto(jobId: string): void {
  photos.delete(jobId);
}

/** Forgets every photo, for tests. */
export function releaseAllPhotos(): void {
  photos.clear();
}

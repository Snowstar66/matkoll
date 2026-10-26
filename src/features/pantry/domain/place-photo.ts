import { z } from "zod";
import { locationSchema, type Location } from "@/features/catalog";
import { maxImageBytes } from "@/lib/images";
import { locateResultSchema, readingSchema, type PhotoPoint } from "./photo-numbers";

// Senaste foto (Story 10.1, FR-37, AD-26): the latest photo of a place
// (Kyl, Frys or Skafferi on one pantry_site) is kept in the private Storage
// bucket pantry-photo once a write from its suggestions has succeeded. The
// client posts the same resized photo that was analysed, with its place,
// location, the time it was taken, the reading and the points (when they
// have come), to POST /api/pantry/photo. Points that come later are added
// with savePlacePhotoPoints. Pure, so it is tested without Storage.

/** The private Storage bucket of the photos (AD-26). Never public, never a signed URL. */
export const placePhotoBucket = "pantry-photo";

/** The image types a kept photo may have: the client's canvas gives JPEG, a small PNG is sent as it is. */
export const placePhotoMediaTypes = ["image/jpeg", "image/png"] as const;
export type PlacePhotoMediaType = (typeof placePhotoMediaTypes)[number];

const extensions: Record<PlacePhotoMediaType, string> = { "image/jpeg": "jpg", "image/png": "png" };

const folders: Record<Location, string> = { Kyl: "kyl", Frys: "frys", Skafferi: "skafferi" };

/** The location's folder in a photo's path: "kyl", "frys" or "skafferi" (pantry_photo_object_path_check). */
export function placePhotoFolder(location: Location): string {
  return folders[location];
}

/**
 * The path of a photo in the bucket: `<user_id>/<site_id>/<kyl|frys|skafferi>/<photo_id>.<jpg|png>`.
 * The first folder is the user's id, which the bucket's policies require
 * (AD-26). Every photo gets a new path, so a file is never overwritten.
 */
export function placePhotoPath(
  userId: string,
  siteId: string,
  location: Location,
  id: string,
  mediaType: PlacePhotoMediaType,
): string {
  return `${userId}/${siteId}/${placePhotoFolder(location)}/${id}.${extensions[mediaType]}`;
}

/** How far back the time a photo was taken may be: a day. */
export const maxTakenAtAgeMs = 24 * 60 * 60 * 1000;

/**
 * The time a photo was taken as the client says (when its analysis started),
 * or `now` when that is in the future or more than maxTakenAtAgeMs ago: it is
 * the time Pontus recognises, but the client's clock is not trusted further.
 */
export function clampTakenAt(takenAt: Date, now: Date): Date {
  const time = takenAt.getTime();
  if (!Number.isFinite(time) || time > now.getTime() || time < now.getTime() - maxTakenAtAgeMs) return new Date(now);
  return new Date(time);
}

/** The longest JSON text field taken with a photo, before it is parsed: 25 labels of 200 characters fit well. */
export const maxPlacePhotoJsonChars = 16 * 1024;

/** Largest request with a photo to save: the photo (maxImageBytes) and 64 KB for the form's headers and fields. */
export const maxPlacePhotoBodyBytes = maxImageBytes + 64 * 1024;

/** A form field holding JSON, at most maxPlacePhotoJsonChars, read with `schema`. */
function jsonField<T extends z.ZodType>(schema: T) {
  return z
    .string()
    .max(maxPlacePhotoJsonChars)
    .transform((text, context): unknown => {
      try {
        return JSON.parse(text);
      } catch {
        context.addIssue({ code: "custom", message: "Not JSON" });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

/** The points of a photo: within locateResultSchema, at most one per item number. */
const placePhotoPointsFieldSchema = locateResultSchema.refine(
  (result) => new Set(result.positions.map((point) => point.n)).size === result.positions.length,
  { message: "One point per item" },
);

/**
 * The fields that come with the photo to POST /api/pantry/photo (AD-2):
 * the photo's place (`site`, a uuid), its location, when it was taken (an ISO
 * time with offset), the reading (a JSON list, readingSchema) and, when they
 * have come, the points (JSON, locateResultSchema), each for an item of the
 * reading. The photo itself is checked by readImageForm.
 */
export const placePhotoFormSchema = z
  .object({
    site: z.uuid(),
    location: locationSchema,
    takenAt: z.iso.datetime({ offset: true }).transform((text) => new Date(text)),
    reading: jsonField(readingSchema),
    points: jsonField(placePhotoPointsFieldSchema).optional(),
  })
  .refine((form) => (form.points?.positions ?? []).every((point) => point.n <= form.reading.length), {
    message: "A point for an item that is not in the reading",
    path: ["points"],
  });
export type PlacePhotoForm = z.infer<typeof placePhotoFormSchema>;

/** Reads the form's text fields (`null` when missing, as readImageForm gives them) with placePhotoFormSchema. */
export function readPlacePhotoForm(fields: Record<"site" | "location" | "takenAt" | "reading" | "points", string | null>) {
  return placePhotoFormSchema.safeParse({
    site: fields.site,
    location: fields.location,
    takenAt: fields.takenAt,
    reading: fields.reading,
    points: fields.points ?? undefined,
  });
}

/** What savePlacePhotoPoints takes: the saved photo's id and the points that came after it was saved. */
export const placePhotoPointsSchema = z.object({
  id: z.uuid(),
  points: placePhotoPointsFieldSchema,
});
export type PlacePhotoPointsInput = z.input<typeof placePhotoPointsSchema>;

/** The points as the row keeps them: `null` for none, so a later lookup may still add them. */
export function storedPoints(points: { positions: readonly PhotoPoint[] } | undefined | null): PhotoPoint[] | null {
  return points && points.positions.length > 0 ? [...points.positions] : null;
}

import { z } from "zod";
import { locationSchema, type Location } from "@/features/catalog";
import { maxImageBytes } from "@/lib/images";
import {
  locateResultSchema,
  maxReadingItems,
  photoPointSchema,
  pointsByNumber,
  readingSchema,
  type PhotoMarker,
  type PhotoPoint,
} from "./photo-numbers";
import { definite } from "./places";

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

// Visa senaste fotot (Story 10.2, FR-38, UX-DR21, UX-DR22): Lagersaldo shows the
// latest photo of the chosen location on the place it shows, when it is
// younger than placePhotoMaxAgeMs, as a line under the camera button with
// "Visa", which opens the photo sheet of Story 6.6 with the saved points and
// the reading as a numbered list. The image itself comes only from
// GET /api/pantry/photo/[id], after "Visa", and is never sent to the AI.

/** A photo is shown for at most 30 days, counted from when it was taken (AD-26). */
export const placePhotoMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

/** The oldest time a photo shown at `now` may have been taken. */
export function placePhotoCutoff(now: Date): Date {
  return new Date(now.getTime() - placePhotoMaxAgeMs);
}

/** A saved photo as Lagersaldo reads it (listPlacePhotos): its row, never the image. */
export type PlacePhoto = {
  id: string;
  location: Location;
  takenAt: Date;
  width: number;
  height: number;
  /** The AI's items in reading order: item n is reading[n − 1]. */
  reading: string[];
  /** The points of the numbers (Story 6.6), or `null` when none came. */
  points: PhotoPoint[] | null;
};

/** A saved photo's row as read from pantry_photo, checked before Lagersaldo shows it. */
export const placePhotoRowSchema = z.object({
  id: z.uuid(),
  location: locationSchema,
  taken_at: z.string().transform((text, context) => {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({ code: "custom", message: "Not a time" });
      return z.NEVER;
    }
    return date;
  }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  reading: readingSchema,
  points: z.array(photoPointSchema).max(maxReadingItems).nullable(),
});

/** A checked row as a PlacePhoto. */
export function toPlacePhoto(row: z.output<typeof placePhotoRowSchema>): PlacePhoto {
  return {
    id: row.id,
    location: row.location,
    takenAt: row.taken_at,
    width: row.width,
    height: row.height,
    reading: row.reading,
    points: row.points && row.points.length > 0 ? row.points : null,
  };
}

/** The time zone a photo's time is written in: Pontus's. */
const photoTimeZone = "Europe/Stockholm";

/** The month abbreviations, fixed so the server and every browser write the same. */
const shortMonths = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

type TimeParts = { year: number; month: number; day: number; hour: number; minute: number };

function stockholmParts(date: Date): TimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: photoTimeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/** The day of `parts` counted in days, so two days can be told apart and counted between. */
function dayNumber({ year, month, day }: TimeParts): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * When a photo was taken, in Swedish time (Europe/Stockholm): "idag 15:42",
 * "igår 09:10" or "24 okt 15:42". Pure: `now` decides which day is today.
 */
export function photoTimeText(takenAt: Date, now: Date): string {
  const taken = stockholmParts(takenAt);
  const time = `${String(taken.hour).padStart(2, "0")}:${String(taken.minute).padStart(2, "0")}`;
  const daysAgo = dayNumber(stockholmParts(now)) - dayNumber(taken);
  if (daysAgo === 0) return `idag ${time}`;
  if (daysAgo === 1) return `igår ${time}`;
  return `${taken.day} ${shortMonths[taken.month - 1]} ${time}`;
}

/** The line under the camera button: "Senaste foto av kylen: idag 15:42". */
export function latestPhotoText(location: Location, time: string): string {
  return `Senaste foto av ${definite[location]}: ${time}`;
}

/** The text button on the line. */
export const latestPhotoOpenText = "Visa";

/** "Visa"'s name for a screen reader: "Visa senaste foto av kylen". */
export function latestPhotoOpenLabel(location: Location): string {
  return `Visa senaste foto av ${definite[location]}`;
}

/**
 * The photo sheet's subtitle: "Taget idag 15:42. Numren visar vad AI:n läste
 * av.", or "Taget idag 15:42." when the photo has no markers.
 */
export function photoTakenText(time: string, hasPoints: boolean): string {
  return hasPoints ? `Taget ${time}. Numren visar vad AI:n läste av.` : `Taget ${time}.`;
}

/** The saved photo's alt text: "Senaste fotot av kylen". */
export function savedPhotoAlt(location: Location): string {
  return `Senaste fotot av ${definite[location]}`;
}

/** Over the numbered list of the reading, under the photo. */
export const photoReadingHeading = "AI:n läste av:";

/** The text button last in the sheet. */
export const removePhotoText = "Ta bort fotot";

/** The question that replaces the sheet: "Ta bort fotot av kylen? Det går inte att ångra." */
export function removePhotoQuestion(location: Location): string {
  return `Ta bort fotot av ${definite[location]}? Det går inte att ångra.`;
}

/** The short confirmation afterwards: "Fotot av kylen är borttaget." */
export function removedPhotoText(location: Location): string {
  return `Fotot av ${definite[location]} är borttaget.`;
}

/**
 * The markers of a saved photo: one per point, labelled with its number in
 * the reading, in percent of the photo's width and height, in number order.
 * Only numbers that are in the reading, at most one per number, and never a
 * placeholder item's ("vara"), as pointsByNumber gives them.
 */
export function savedPhotoMarkers(points: readonly PhotoPoint[] | null, reading: readonly string[]): PhotoMarker[] {
  if (!points) return [];
  return [...pointsByNumber({ positions: [...points] }, reading).values()]
    .sort((a, b) => a.n - b.n)
    .map((point) => ({ key: point.n, label: point.n, left: point.x / 10, top: point.y / 10 }));
}

/** What removePlacePhoto takes: the photo's id. */
export const removePlacePhotoSchema = z.object({ id: z.uuid() });
export type RemovePlacePhotoInput = z.input<typeof removePlacePhotoSchema>;

/** The address of a saved photo: the Route Handler that sends it after checking the user (AD-26). */
export function placePhotoUrl(id: string): string {
  return `/api/pantry/photo/${encodeURIComponent(id)}`;
}

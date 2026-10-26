import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import type { Location } from "@/features/catalog";
import type { PhotoPoint } from "../domain/photo-numbers";
import {
  placePhotoBucket,
  placePhotoCutoff,
  placePhotoMediaTypes,
  placePhotoRowSchema,
  toPlacePhoto,
  type PlacePhoto,
  type PlacePhotoMediaType,
} from "../domain/place-photo";
import { PantryDataError, pantryWriteError, type PantryDb } from "./client";

// The latest photo of each place (Story 10.1, AD-26): every call to Storage
// and to pantry_photo is here, and the pantry module alone makes them (AD-1).
// Every function needs the signed-in user's session client, never an admin
// client, so the bucket's policies and RLS limit it to the user's own files
// and rows (AD-4). A file is never overwritten (`upsert: false`), never given
// a public or signed URL, and never deleted with SQL: remove() goes through
// the Storage API. Errors carry only a fixed reason and a status or Postgres
// code, never a path, a place's name or the reading.

/** The status of a Storage error, without its message (which may name the path). */
function statusOf(error: { status?: number; statusCode?: string }): string {
  return String(error.statusCode ?? error.status ?? "unknown");
}

/** PantryDataError's detail for an upload that Storage refused as not the user's (401 or 403). */
export const uploadUnauthorizedDetail = "upload_unauthorized";

/**
 * Runs a call to Supabase. Anything it throws (a lost connection, a bug in
 * the client) becomes a PantryDataError `<operation>_threw` without its
 * message, which may hold the path; a PantryDataError is passed on.
 */
async function guarded<T>(operation: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof PantryDataError) throw error;
    throw new PantryDataError(`${operation}_threw`);
  }
}

/**
 * Uploads the photo's bytes to `path` in the bucket pantry-photo, as
 * `mediaType`, never over an existing file. Throws PantryDataError
 * uploadUnauthorizedDetail when Storage refuses it as not the user's (401,
 * 403: the bucket's policies), or `upload_failed <status>`.
 */
export async function uploadPlacePhoto(
  db: PantryDb,
  path: string,
  bytes: Uint8Array,
  mediaType: PlacePhotoMediaType,
): Promise<void> {
  return guarded("upload", async () => {
    const { error } = await db.storage.from(placePhotoBucket).upload(path, bytes, { contentType: mediaType, upsert: false });
    if (!error) return;
    const status = statusOf(error);
    if (status === "401" || status === "403") throw new PantryDataError(uploadUnauthorizedDetail);
    throw new PantryDataError(`upload_failed ${status}`);
  });
}

/** A photo's row as save_pantry_photo takes it; its file is uploaded already. */
export type PantryPhotoRow = {
  id: string;
  siteId: string;
  location: Location;
  objectPath: string;
  mediaType: PlacePhotoMediaType;
  width: number;
  height: number;
  takenAt: Date;
  reading: readonly string[];
  points: readonly PhotoPoint[] | null;
};

/**
 * What save_pantry_photo did: `saved` the row, with the path of the photo it
 * replaced or `null`, or nothing, since the place and location have a photo
 * taken later (`stale`).
 */
export type SavePhotoOutcome = { kind: "saved"; previous: string | null } | { kind: "stale" };

/**
 * Makes `row` the photo of its place and location (save_pantry_photo, which
 * takes pantry_lock()), unless a photo taken later is there. Throws
 * PantryDataError `site_gone` (MK410) for a place that is not the user's or
 * is gone, `save_failed <code>`, `save_threw` or `invalid_answer`.
 */
export async function savePantryPhotoIn(db: PantryDb, row: PantryPhotoRow): Promise<SavePhotoOutcome> {
  return guarded("save", async () => {
    const { data, error } = await db.rpc("save_pantry_photo", {
      site: row.siteId,
      place: row.location,
      photo_id: row.id,
      photo_path: row.objectPath,
      photo_type: row.mediaType,
      photo_width: row.width,
      photo_height: row.height,
      photo_taken_at: row.takenAt.toISOString(),
      photo_reading: [...row.reading] as Json,
      ...(row.points ? { photo_points: row.points.map(({ n, x, y }) => ({ n, x, y })) as Json } : {}),
    });
    if (error) throw pantryWriteError("save_failed", error.code);
    const answer = Array.isArray(data) ? data[0] : null;
    if (answer?.outcome === "stale") return { kind: "stale" };
    if (answer?.outcome === "saved") {
      return { kind: "saved", previous: typeof answer.previous_path === "string" ? answer.previous_path : null };
    }
    throw new PantryDataError("invalid_answer");
  });
}

/**
 * Whether the user's photo `id` has a row: after a save whose answer was an
 * error, it says whether the save went through anyway. Throws
 * PantryDataError `query_failed <code>` or `query_threw`.
 */
export async function photoRowExistsIn(db: PantryDb, id: string): Promise<boolean> {
  return guarded("query", async () => {
    const { data, error } = await db.from("pantry_photo").select("id").eq("id", id).maybeSingle();
    if (error) throw new PantryDataError(`query_failed ${error.code}`);
    return data !== null;
  });
}

/**
 * The length of the reading of the user's photo `id`, or `null` when there is
 * no such photo (gone, replaced, another user's). Throws PantryDataError
 * `query_failed <code>`, `query_threw` or `invalid_row`.
 */
export async function placePhotoReadingLengthIn(db: PantryDb, id: string): Promise<number | null> {
  return guarded("query", async () => {
    const { data, error } = await db.from("pantry_photo").select("reading").eq("id", id).maybeSingle();
    if (error) throw new PantryDataError(`query_failed ${error.code}`);
    if (data === null) return null;
    if (!Array.isArray(data.reading)) throw new PantryDataError("invalid_row");
    return data.reading.length;
  });
}

/**
 * Removes the files at `paths` from the bucket with the Storage API (AD-26)
 * and returns how many were removed. A file that is gone already, or not the
 * user's, is not counted. Throws PantryDataError `remove_failed <status>` or
 * `remove_threw`.
 */
export async function removePlacePhotoFiles(db: PantryDb, paths: readonly string[]): Promise<number> {
  if (paths.length === 0) return 0;
  return guarded("remove", async () => {
    const { data, error } = await db.storage.from(placePhotoBucket).remove([...paths]);
    if (error) throw new PantryDataError(`remove_failed ${statusOf(error)}`);
    return data?.length ?? 0;
  });
}

/**
 * Adds the points to the user's photo `id` when it has none yet (Story 6.6's
 * lookup answered after the photo was saved) and every point is for an item
 * of its reading (set_pantry_photo_points), and says whether it did. A photo
 * that is gone, replaced, has its points already, or points that do not fit
 * its reading are left as they are. Throws PantryDataError
 * `update_failed <code>` or `update_threw`.
 */
export async function setPlacePhotoPointsIn(db: PantryDb, id: string, points: readonly PhotoPoint[]): Promise<boolean> {
  return guarded("update", async () => {
    const { data, error } = await db.rpc("set_pantry_photo_points", {
      photo_id: id,
      photo_points: points.map(({ n, x, y }) => ({ n, x, y })) as Json,
    });
    if (error) throw new PantryDataError(`update_failed ${error.code}`);
    return data === true;
  });
}

// Visa senaste fotot (Story 10.2, AD-26): Hemma reads the rows of a place's
// photos, never the files; the Route Handler GET /api/pantry/photo/[id]
// reads one row and its file; "Ta bort fotot" deletes the row and then the
// file. A photo taken before placePhotoCutoff is never read: it is as good
// as gone, and Story 10.3's sweep removes it.

/**
 * The user's photos of the place `siteId` taken within the last 30 days at
 * `now` (at most one per location), as Hemma shows them. A row that does not
 * pass placePhotoRowSchema is left out. Throws PantryDataError
 * `query_failed <code>` or `query_threw`.
 */
export async function loadPlacePhotosIn(db: PantryDb, siteId: string, now: Date): Promise<PlacePhoto[]> {
  return guarded("query", async () => {
    const { data, error } = await db
      .from("pantry_photo")
      .select("id, location, taken_at, width, height, reading, points")
      .eq("site_id", siteId)
      .gte("taken_at", placePhotoCutoff(now).toISOString());
    if (error) throw new PantryDataError(`query_failed ${error.code}`);
    return (data ?? []).flatMap((row) => {
      const parsed = placePhotoRowSchema.safeParse(row);
      return parsed.success ? [toPlacePhoto(parsed.data)] : [];
    });
  });
}

/** Where a photo's file is, and its type: what the Route Handler needs to send it. */
export type PlacePhotoFile = { objectPath: string; mediaType: PlacePhotoMediaType };

const isMediaType = (type: unknown): type is PlacePhotoMediaType =>
  (placePhotoMediaTypes as readonly unknown[]).includes(type);

/**
 * The file of the user's photo `id`, when it was taken within the last 30
 * days at `now`; `null` for a photo that is gone, older or not the user's
 * (RLS). Throws PantryDataError `query_failed <code>`, `query_threw` or
 * `invalid_row`.
 */
export async function loadPlacePhotoIn(db: PantryDb, id: string, now: Date): Promise<PlacePhotoFile | null> {
  return guarded("query", async () => {
    const { data, error } = await db
      .from("pantry_photo")
      .select("object_path, media_type")
      .eq("id", id)
      .gte("taken_at", placePhotoCutoff(now).toISOString())
      .maybeSingle();
    if (error) throw new PantryDataError(`query_failed ${error.code}`);
    if (data === null) return null;
    if (typeof data.object_path !== "string" || !isMediaType(data.media_type)) throw new PantryDataError("invalid_row");
    return { objectPath: data.object_path, mediaType: data.media_type };
  });
}

/**
 * The bytes of the file at `path` in the bucket, read through the bucket's
 * policies, so only the user's own; `null` when there is no such file of the
 * user's (Storage's 404). Throws PantryDataError `download_failed <status>`
 * or `download_threw`.
 */
export async function downloadPlacePhoto(db: PantryDb, path: string): Promise<Blob | null> {
  return guarded("download", async () => {
    const { data, error } = await db.storage.from(placePhotoBucket).download(path);
    if (error) {
      const status = statusOf(error);
      // Storage answers a missing object, or one the policies hide, with 404 in its body (sometimes as HTTP 400).
      if (status === "404" || (error as { status?: number }).status === 404) return null;
      throw new PantryDataError(`download_failed ${status}`);
    }
    return data;
  });
}

/**
 * Deletes the user's photo row `id` and gives the path of its file, or
 * `null` when there was no such row (gone already, or not the user's). The
 * file is left for the caller to remove. Throws PantryDataError
 * `delete_failed <code>` or `delete_threw`.
 */
export async function deletePlacePhotoRowIn(db: PantryDb, id: string): Promise<string | null> {
  return guarded("delete", async () => {
    const { data, error } = await db.from("pantry_photo").delete().eq("id", id).select("object_path");
    if (error) throw new PantryDataError(`delete_failed ${error.code}`);
    const path = data?.[0]?.object_path;
    return typeof path === "string" ? path : null;
  });
}

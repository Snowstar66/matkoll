import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import type { Location } from "@/features/catalog";
import type { PhotoPoint } from "../domain/photo-numbers";
import { placePhotoBucket, type PlacePhotoMediaType } from "../domain/place-photo";
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

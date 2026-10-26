import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import type { Location } from "@/features/catalog";
import type { PhotoPoint } from "../domain/photo-numbers";
import { placePhotoBucket, type PlacePhotoMediaType } from "../domain/place-photo";
import { inBatches, intervalOf, photoSweepBatchSize } from "../domain/photo-sweep";
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
 * Removes the files at `paths` from the bucket with the Storage API (AD-26),
 * at most photoSweepBatchSize (100) names per call to Storage, and returns
 * how many were removed. A file that is gone already, or not the user's, is
 * not counted. Throws PantryDataError `remove_failed <status>` or
 * `remove_threw` at the first batch that fails; the batches before it are
 * removed.
 */
export async function removePlacePhotoFiles(db: PantryDb, paths: readonly string[]): Promise<number> {
  let removed = 0;
  for (const batch of inBatches(paths)) {
    removed += await guarded("remove", async () => {
      const { data, error } = await db.storage.from(placePhotoBucket).remove(batch);
      if (error) throw new PantryDataError(`remove_failed ${statusOf(error)}`);
      return data?.length ?? 0;
    });
  }
  return removed;
}

/** A photo the sweep removes: its row's id and its file (Story 10.3). */
export type ExpiredPlacePhoto = { id: string; objectPath: string };

/**
 * The user's photos taken before `before` (too old to be shown, FR-39),
 * oldest first, at most `limit` (photoSweepBatchSize). Throws PantryDataError
 * `query_failed <code>`, `query_threw` or `invalid_row`.
 */
export async function loadExpiredPlacePhotosIn(
  db: PantryDb,
  before: Date,
  limit = photoSweepBatchSize,
): Promise<ExpiredPlacePhoto[]> {
  return guarded("query", async () => {
    const { data, error } = await db
      .from("pantry_photo")
      .select("id, object_path")
      .lt("taken_at", before.toISOString())
      .order("taken_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (error) throw new PantryDataError(`query_failed ${error.code}`);
    return (data ?? []).map((row) => {
      if (typeof row.id !== "string" || typeof row.object_path !== "string") throw new PantryDataError("invalid_row");
      return { id: row.id, objectPath: row.object_path };
    });
  });
}

/**
 * The paths of the user's files in the bucket that no row of pantry_photo
 * points at and that were uploaded more than `minAgeMs` ago, oldest first, at
 * most 100 (pantry_photo_orphans, which reads storage.objects and
 * pantry_photo as the user, so only the user's own count). The sweep passes
 * photoOrphanMinAgeMs (10 minutes), so a save in progress keeps its file.
 * Throws PantryDataError `orphans_failed <code>`, `orphans_threw` or
 * `invalid_answer`.
 */
export async function loadPlacePhotoOrphansIn(db: PantryDb, minAgeMs: number): Promise<string[]> {
  return guarded("orphans", async () => {
    const { data, error } = await db.rpc("pantry_photo_orphans", { min_age: intervalOf(minAgeMs) });
    if (error) throw new PantryDataError(`orphans_failed ${error.code}`);
    const names: unknown[] = Array.isArray(data) ? data : [];
    if (!names.every((name): name is string => typeof name === "string")) throw new PantryDataError("invalid_answer");
    return names;
  });
}

/**
 * Deletes the user's photo rows `ids` and returns how many went (a row that
 * is gone already is not counted). Only the rows: their files are removed
 * with removePlacePhotoFiles. Throws PantryDataError `delete_failed <code>`
 * or `delete_threw`.
 */
export async function deletePlacePhotoRowsIn(db: PantryDb, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return guarded("delete", async () => {
    const { data, error } = await db.from("pantry_photo").delete().in("id", [...ids]).select("id");
    if (error) throw new PantryDataError(`delete_failed ${error.code}`);
    return data?.length ?? 0;
  });
}

/**
 * The paths of the files of the user's photos on the place `siteId`, read
 * before the place is deleted (Story 10.3): the cascade takes the rows, and
 * the files are removed after. Throws PantryDataError `query_failed <code>`,
 * `query_threw` or `invalid_row`.
 */
export async function loadSitePhotoPathsIn(db: PantryDb, siteId: string): Promise<string[]> {
  return guarded("query", async () => {
    const { data, error } = await db.from("pantry_photo").select("object_path").eq("site_id", siteId);
    if (error) throw new PantryDataError(`query_failed ${error.code}`);
    return (data ?? []).map((row) => {
      if (typeof row.object_path !== "string") throw new PantryDataError("invalid_row");
      return row.object_path;
    });
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

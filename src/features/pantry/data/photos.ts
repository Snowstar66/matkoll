import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import type { Location } from "@/features/catalog";
import type { PhotoPoint } from "../domain/photo-numbers";
import { inBatches, intervalOf, photoSweepBatchSize } from "../domain/photo-sweep";
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

/** What removePlacePhotoFiles did: the paths Storage says it removed, and the first failure, if any. */
export type RemovedPlacePhotoFiles = { removed: string[]; failed: string | null };

/**
 * Removes the files at `paths` from the bucket with the Storage API (AD-26),
 * at most photoSweepBatchSize (100) names per call to Storage, and says which
 * paths Storage removed. A file that is gone already, or not the user's, is
 * not among them. Never throws: a batch that fails is skipped, its reason
 * (`remove_failed <status>` or `remove_threw`) is `failed` (the first one if
 * several fail), and the other batches are still removed.
 */
export async function removePlacePhotoFiles(db: PantryDb, paths: readonly string[]): Promise<RemovedPlacePhotoFiles> {
  const removed: string[] = [];
  let failed: string | null = null;
  for (const batch of inBatches(paths)) {
    try {
      const names = await guarded("remove", async () => {
        const { data, error } = await db.storage.from(placePhotoBucket).remove(batch);
        if (error) throw new PantryDataError(`remove_failed ${statusOf(error)}`);
        return (data ?? []).map((file) => file.name);
      });
      const asked = new Set(batch);
      removed.push(...names.filter((name) => typeof name === "string" && asked.has(name)));
    } catch (error) {
      failed ??= error instanceof PantryDataError ? error.detail : "remove_threw";
    }
  }
  return { removed, failed };
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
 * Deletes the user's photo rows `ids` (at most photoSweepBatchSize) that
 * were taken before `before` and whose file is no longer in the bucket
 * (delete_expired_pantry_photos), and returns the ids it deleted. So a row
 * never points at a missing file, a row whose file is still there stays, and
 * a row replaced since it was read (a new id, or taken later) stays. Throws
 * PantryDataError `delete_failed <code>`, `delete_threw` or `invalid_answer`.
 */
export async function deleteExpiredPlacePhotoRowsIn(db: PantryDb, ids: readonly string[], before: Date): Promise<string[]> {
  if (ids.length === 0) return [];
  return guarded("delete", async () => {
    const { data, error } = await db.rpc("delete_expired_pantry_photos", {
      photo_ids: [...ids],
      taken_before: before.toISOString(),
    });
    if (error) throw new PantryDataError(`delete_failed ${error.code}`);
    const deleted: unknown[] = Array.isArray(data) ? data : [];
    if (!deleted.every((id): id is string => typeof id === "string")) throw new PantryDataError("invalid_answer");
    return deleted;
  });
}

/** The most folder levels below the starting folder the walk goes into: a photo is at `<site>/<location>/<file>`. */
export const photoWalkMaxDepth = 4;

/** The most folders one walk lists, so a listing never runs away. */
export const photoWalkMaxFolders = 1_000;

/**
 * Every file under `folder` in the bucket (such as `<user_id>/<site_id>`), in
 * all folders below it, at most photoWalkMaxDepth levels deep, and on every
 * page of each (Storage's list() goes one folder at a time and gives at most
 * photoSweepBatchSize entries per call). A folder is an entry without an id.
 * Throws PantryDataError `list_failed <status>`, `list_threw`, `list_too_deep`
 * or `list_too_many_folders`, never with a path.
 */
export async function listPlacePhotoFilesIn(db: PantryDb, folder: string): Promise<string[]> {
  const files: string[] = [];
  const folders: { path: string; depth: number }[] = [{ path: folder, depth: 0 }];
  let visited = 0;
  while (folders.length > 0) {
    const current = folders.shift()!;
    visited += 1;
    if (visited > photoWalkMaxFolders) throw new PantryDataError("list_too_many_folders");
    for (let offset = 0; ; offset += photoSweepBatchSize) {
      const entries = await guarded("list", async () => {
        const { data, error } = await db.storage.from(placePhotoBucket).list(current.path, {
          limit: photoSweepBatchSize,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw new PantryDataError(`list_failed ${statusOf(error)}`);
        return data ?? [];
      });
      for (const entry of entries) {
        const path = `${current.path}/${entry.name}`;
        if (entry.id !== null && entry.id !== undefined) {
          files.push(path);
        } else {
          if (current.depth + 1 > photoWalkMaxDepth) throw new PantryDataError("list_too_deep");
          folders.push({ path, depth: current.depth + 1 });
        }
      }
      if (entries.length < photoSweepBatchSize) break;
    }
  }
  return files;
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

// Visa senaste fotot (Story 10.2, AD-26): Förråd reads the rows of a place's
// photos, never the files; the Route Handler GET /api/pantry/photo/[id]
// reads one row and its file; "Ta bort fotot" deletes the row and then the
// file. A photo taken before placePhotoCutoff is never read: it is as good
// as gone, and Story 10.3's sweep removes it.

/**
 * The user's photos of the place `siteId` taken within the last 30 days at
 * `now` (at most one per location), as Förråd shows them. A row that does not
 * pass placePhotoRowSchema is left out and logged as `pantry_photos_unavailable`
 * (reason `invalid_row`, never the row). Throws PantryDataError
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
      if (parsed.success) return [toPlacePhoto(parsed.data)];
      console.error("pantry_photos_unavailable", { reason: "invalid_row" });
      return [];
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
 * Whether the user has a file at `path` in the bucket, read through the
 * bucket's policies with a HEAD request, so the file is never downloaded
 * (the route's HEAD, Story 10.2). Storage's 400 and 404 (a missing or
 * hidden object) give `false`; any other failure throws PantryDataError
 * `exists_threw`.
 */
export async function placePhotoFileExists(db: PantryDb, path: string): Promise<boolean> {
  return guarded("exists", async () => {
    // exists answers 400 and 404 with `false` and throws anything else, which guarded turns into exists_threw.
    const { data } = await db.storage.from(placePhotoBucket).exists(path);
    return data === true;
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

import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { isErrorCode } from "@/lib/errors";
import { thingCategories, thingConfidences } from "../domain/thing";
import type { CardSnapshot } from "../domain/thing-edit";
import { thingPhotoBucket, thingPhotoMediaTypes, type ThingCard, type ThingPhotoMediaType } from "../domain/thing-photo";
import { cardGoneCode, guarded, ThingsDataError, type ThingsDb } from "./client";
import { loadPointersIn, relinkItemsIn } from "./merge";
import type { ThingBox } from "@/lib/thing-box";
import { boxColumnsOf, boxOfRow } from "../domain/thing-card";

// The cards (Story 18.2): every call to thing_photo and to the bucket
// thing-photo is here. Every function needs the signed-in user's session
// client, so the bucket's policies and RLS limit it to the user's own files
// and rows (AD-4). A file is never overwritten, never given a public or
// signed URL, and never deleted with SQL: remove() goes through the Storage
// API (AD-26). Errors carry only a fixed reason and a status or Postgres code.

/** The status of a Storage error, without its message (which may name the path). */
function statusOf(error: { status?: number; statusCode?: string }): string {
  return String(error.statusCode ?? error.status ?? "unknown");
}

const cardRowSchema = z.object({
  id: z.uuid(),
  place_id: z.uuid(),
  object_path: z.string(),
  media_type: z.enum(thingPhotoMediaTypes),
  taken_at: z.string(),
  created_at: z.string(),
  status: z.enum(["reading", "done", "failed"]),
  error_code: z.string().nullable(),
  unseen_note: z.string().nullable(),
  unseen_count: z.number().int(),
});

const cardSelect = "id, place_id, object_path, media_type, taken_at, created_at, status, error_code, unseen_note, unseen_count";

/** A card with the file's path and type, for the server only; the page gets a ThingCard. */
export type StoredCard = ThingCard & { objectPath: string; mediaType: ThingPhotoMediaType };

function toCard(row: unknown): StoredCard {
  const parsed = cardRowSchema.safeParse(row);
  if (!parsed.success) throw new ThingsDataError("invalid_row");
  const r = parsed.data;
  return {
    id: r.id,
    placeId: r.place_id,
    objectPath: r.object_path,
    mediaType: r.media_type,
    takenAt: new Date(r.taken_at),
    createdAt: new Date(r.created_at),
    status: r.status,
    errorCode: r.error_code !== null && isErrorCode(r.error_code) ? r.error_code : r.status === "failed" ? "ai_unavailable" : null,
    unseenNote: r.unseen_note,
    unseenCount: r.unseen_count,
  };
}

/** The cards of a place, newest first. Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadCardsIn(db: ThingsDb, placeId: string): Promise<StoredCard[]> {
  const { data, error } = await db
    .from("thing_photo")
    .select(cardSelect)
    .eq("place_id", placeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  return data.map(toCard);
}

/** One card, or `null` when it is gone or not the user's. */
export async function loadCardIn(db: ThingsDb, id: string): Promise<StoredCard | null> {
  const { data, error } = await db.from("thing_photo").select(cardSelect).eq("id", id).maybeSingle();
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  return data ? toCard(data) : null;
}

/** Uploads the card's bytes to `path`, never over an existing file. Throws ThingsDataError `upload_failed <status>`. */
export async function uploadCardFile(db: ThingsDb, path: string, bytes: Uint8Array, mediaType: ThingPhotoMediaType): Promise<void> {
  return guarded("upload", async () => {
    const { error } = await db.storage.from(thingPhotoBucket).upload(path, bytes, { contentType: mediaType, upsert: false });
    if (error) throw new ThingsDataError(`upload_failed ${statusOf(error)}`);
  });
}

export type NewCard = {
  id: string;
  placeId: string;
  objectPath: string;
  mediaType: ThingPhotoMediaType;
  width: number;
  height: number;
  takenAt: Date;
  /** The card of the same place this one replaces when it is read (Ta om); null for a card that adds. */
  replacesId?: string | null;
};

/**
 * Inserts the card as `reading`; its file is uploaded already. Returns `gone`
 * when the place is not the user's or is removed (the foreign key, 23503).
 */
export async function insertCardIn(db: ThingsDb, card: NewCard): Promise<"saved" | "place_gone"> {
  return guarded("save", async () => {
    const { error } = await db.from("thing_photo").insert({
      id: card.id,
      place_id: card.placeId,
      object_path: card.objectPath,
      media_type: card.mediaType,
      width: card.width,
      height: card.height,
      taken_at: card.takenAt.toISOString(),
      replaces_photo_id: card.replacesId ?? null,
    });
    if (!error) return "saved";
    if (error.code === "23503") return "place_gone";
    throw new ThingsDataError(`save_failed ${error.code}`);
  });
}

/** A card whose reading did not go: `failed` with the code, for a card that is still `reading`. */
export async function markCardFailedIn(db: ThingsDb, id: string, code: string): Promise<void> {
  return guarded("update", async () => {
    const { error } = await db.from("thing_photo").update({ status: "failed", error_code: code }).eq("id", id).eq("status", "reading");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
  });
}

/** "Försök igen": a failed card is `reading` again. `false` when it is not failed any more (or not the user's). */
export async function reopenCardIn(db: ThingsDb, id: string): Promise<boolean> {
  return guarded("update", async () => {
    const { data, error } = await db
      .from("thing_photo")
      // A fresh created_at, so the card is not "stale" at once and counts as the newest.
      .update({ status: "reading", error_code: null, created_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "failed")
      .select("id");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data.length > 0;
  });
}

/** A thing the AI read, with its box on the card (Story 18.7) when the reading gave a reasonable one. */
export type ReadThing = { name: string; category: string; where: string | null; confidence: string; box?: ThingBox | null; count?: number | null };

/**
 * The job's end (save_thing_card): the things are saved, the card is `done`
 * and the card it replaces (Ta om), if any, is removed; a card that replaces
 * nothing only adds. Returns the files of the removed cards, for the caller to remove with the Storage API. Throws
 * ThingsDataError `card_gone` (MK440) or `save_failed <code>`.
 */
export async function saveReadingIn(
  db: ThingsDb,
  reading: { photoId: string; things: readonly ReadThing[]; note: string | null; hidden: number },
): Promise<string[]> {
  return guarded("save", async () => {
    const { data, error } = await db.rpc("save_thing_card", {
      photo: reading.photoId,
      things: reading.things.map((thing) => ({
        name: thing.name,
        category: thing.category,
        where_hint: thing.where,
        confidence: thing.confidence,
        // Story 18.7: save_thing_card saves a box that is inside the photo, and leaves out any other.
        ...(thing.box ? { box: { left: thing.box.left, top: thing.box.top, width: thing.box.width, height: thing.box.height } } : {}),
        // Story 18.23: how many the model counted; save_thing_card keeps a whole number from 1 to 999 and the history starts with it.
        ...(typeof thing.count === "number" ? { count: thing.count } : {}),
      })) as Json,
      note: reading.note ?? undefined,
      hidden_count: reading.hidden,
    });
    if (error) throw new ThingsDataError(error.code === cardGoneCode ? "card_gone" : `save_failed ${error.code}`);
    return Array.isArray(data) ? data.filter((path): path is string => typeof path === "string") : [];
  });
}

/** The card's file, or `null` when it is gone. Throws ThingsDataError `download_failed <status>`. */
export async function downloadCardFile(db: ThingsDb, path: string): Promise<Blob | null> {
  return guarded("download", async () => {
    const { data, error } = await db.storage.from(thingPhotoBucket).download(path);
    if (error) {
      const status = statusOf(error);
      if (status === "404" || (error as { status?: number }).status === 404) return null;
      throw new ThingsDataError(`download_failed ${status}`);
    }
    return data;
  });
}

/** Removes files with the Storage API. Never throws: the first failure is returned (`remove_failed <status>`), the files are then left behind. */
async function removeCardFilesOnce(db: ThingsDb, paths: readonly string[]): Promise<{ failed: string | null }> {
  if (paths.length === 0) return { failed: null };
  try {
    const { error } = await db.storage.from(thingPhotoBucket).remove([...paths]);
    return { failed: error ? `remove_failed ${statusOf(error)}` : null };
  } catch {
    return { failed: "remove_threw" };
  }
}

/** Removes files like removeCardFilesOnce, and once more when that failed (a hiccup), so fewer files are left for the sweep. */
export async function removeCardFiles(db: ThingsDb, paths: readonly string[]): Promise<{ failed: string | null }> {
  const first = await removeCardFilesOnce(db, paths);
  return first.failed === null ? first : removeCardFilesOnce(db, paths);
}

/** The most entries one Storage listing asks for. */
const listPage = 100;

/** The most files one listing of a folder reads, so it never runs away. */
const listMaxFiles = 1_000;

export type StoredFile = { path: string; createdAt: Date | null };

/**
 * The files directly in `folder` (such as `<user>/<place>`), and its
 * sub-folders' names when `folders` is true instead; every page. Throws
 * ThingsDataError `list_failed <status>`, `list_threw` or `list_too_many`.
 */
async function listFolderIn(db: ThingsDb, folder: string, kind: "files" | "folders"): Promise<StoredFile[]> {
  const found: StoredFile[] = [];
  for (let offset = 0; ; offset += listPage) {
    const entries = await guarded("list", async () => {
      const { data, error } = await db.storage.from(thingPhotoBucket).list(folder, {
        limit: listPage,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new ThingsDataError(`list_failed ${statusOf(error)}`);
      return data ?? [];
    });
    for (const entry of entries) {
      // A folder is an entry without an id.
      const isFile = entry.id !== null && entry.id !== undefined;
      if ((kind === "files") !== isFile) continue;
      const created = typeof entry.created_at === "string" ? new Date(entry.created_at) : null;
      found.push({ path: `${folder}/${entry.name}`, createdAt: created && !Number.isNaN(created.getTime()) ? created : null });
    }
    if (found.length > listMaxFiles) throw new ThingsDataError("list_too_many");
    if (entries.length < listPage) break;
  }
  return found;
}

/**
 * The files of a boende's cards, read before the boende is deleted (the
 * cascade takes the rows, not the files): the paths in thing_photo, and every
 * file in the folders of the boende's places (`<user>/<place>/`), so a file
 * without a row goes too. Throws ThingsDataError.
 */
export async function loadSiteCardFilesIn(db: ThingsDb, userId: string, siteId: string, roomKey?: string): Promise<string[]> {
  // With `roomKey` (Story 18.15, "Rensa rummet") only the places of that room.
  const query = db.from("thing_place").select("id").eq("site_id", siteId);
  const { data: places, error: placesError } = await (roomKey === undefined ? query : query.eq("room_key", roomKey));
  if (placesError) throw new ThingsDataError(`query_failed ${placesError.code}`);
  const placeIds = places.map((place) => place.id);
  if (placeIds.length === 0) return [];
  const { data: rows, error } = await db.from("thing_photo").select("object_path").in("place_id", placeIds);
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  const files = new Set(rows.map((row) => row.object_path));
  for (const placeId of placeIds) {
    for (const file of await listFolderIn(db, `${userId}/${placeId}`, "files")) files.add(file.path);
  }
  return [...files];
}

/**
 * The user's card files that have no thing_photo row and are older than
 * `minAgeMs` (a card being saved has its file before its row), at most
 * `limit`. Throws ThingsDataError.
 */
export async function loadCardFileOrphansIn(db: ThingsDb, userId: string, now: Date, minAgeMs: number, limit: number): Promise<string[]> {
  const { data, error } = await db.from("thing_photo").select("object_path");
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  const known = new Set(data.map((row) => row.object_path));
  const orphans: string[] = [];
  for (const folder of await listFolderIn(db, userId, "folders")) {
    for (const file of await listFolderIn(db, folder.path, "files")) {
      // A file whose age is not known is left alone.
      if (known.has(file.path) || !file.createdAt || now.getTime() - file.createdAt.getTime() < minAgeMs) continue;
      orphans.push(file.path);
      if (orphans.length >= limit) return orphans;
    }
  }
  return orphans;
}

const snapshotSelect =
  "id, place_id, object_path, media_type, width, height, taken_at, created_at, status, error_code, unseen_note, unseen_count, thing_item(id, photo_id, place_id, name, category, where_hint, confidence, position, created_at, same_as, source, box_left, box_top, box_width, box_height, box_missed)";

const snapshotRowSchema = z.object({
  id: z.uuid(),
  place_id: z.uuid(),
  object_path: z.string(),
  media_type: z.enum(thingPhotoMediaTypes),
  width: z.number().int(),
  height: z.number().int(),
  taken_at: z.string(),
  created_at: z.string(),
  status: z.enum(["reading", "done", "failed"]),
  error_code: z.string().nullable(),
  unseen_note: z.string().nullable(),
  unseen_count: z.number().int(),
  thing_item: z.array(
    z.object({
      id: z.uuid(),
      photo_id: z.uuid(),
      place_id: z.uuid(),
      name: z.string(),
      category: z.enum(thingCategories),
      where_hint: z.string().nullable(),
      confidence: z.enum(thingConfidences),
      position: z.number().int(),
      created_at: z.string(),
      same_as: z.uuid().nullable(),
      source: z.enum(["photo", "added"]),
      box_left: z.number().nullable(),
      box_top: z.number().nullable(),
      box_width: z.number().nullable(),
      box_height: z.number().nullable(),
      box_missed: z.boolean(),
    }),
  ),
});

/** What removing a card gives back: the snapshot "Ångra" needs, and whether it was a finished card. */
export type RemovedCard = { snapshot: CardSnapshot };

/**
 * "Ta bort kortet" (Story 18.3): reads the finished card with its things, then
 * deletes its row; the things go with it (their foreign key cascades). The
 * file is NOT removed here, so "Ångra" can put the rows back; the caller
 * removes it when the undo time is out (removeCardFileIfOrphan), and the sweep
 * takes it later if that never happens. Returns `null` when the card is gone,
 * not the user's, or not finished. Throws ThingsDataError `remove_failed <code>`
 * or `query_failed <code>` or `invalid_row`.
 */
export async function removeCardIn(db: ThingsDb, id: string): Promise<RemovedCard | null> {
  return guarded("remove", async () => {
    const { data, error } = await db.from("thing_photo").select(snapshotSelect).eq("id", id).maybeSingle();
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    if (!data) return null;
    const parsed = snapshotRowSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const row = parsed.data;
    // The things merged into this card's things, before they become kept things of their own (FK set null).
    const pointers = await loadPointersIn(db, row.thing_item.map((item) => item.id));
    const deleted = await db.from("thing_photo").delete().eq("id", id).select("id");
    if (deleted.error) throw new ThingsDataError(`remove_failed ${deleted.error.code}`);
    if (deleted.data.length === 0) return null;
    return {
      snapshot: {
        id: row.id,
        placeId: row.place_id,
        objectPath: row.object_path,
        mediaType: row.media_type,
        width: row.width,
        height: row.height,
        takenAt: new Date(row.taken_at).toISOString(),
        createdAt: new Date(row.created_at).toISOString(),
        // Story 18.16: a card that failed or is stuck reading can be removed too; "Ångra" brings it back as one that failed.
        status: row.status === "done" ? "done" : "failed",
        errorCode: row.status === "done" ? null : (row.status === "failed" ? row.error_code : null),
        unseenNote: row.unseen_note,
        unseenCount: row.unseen_count,
        things: [...row.thing_item]
          .sort((a, b) => a.position - b.position)
          .map((item) => ({
            id: item.id,
            photoId: item.photo_id,
            placeId: item.place_id,
            name: item.name,
            category: item.category,
            whereHint: item.where_hint,
            confidence: item.confidence,
            position: item.position,
            createdAt: new Date(item.created_at).toISOString(),
            sameAs: item.same_as,
            source: item.source,
            pointedBy: pointers.get(item.id) ?? [],
            box: boxOfRow(item),
            boxMissed: item.box_missed && boxOfRow(item) === null,
          })),
      },
    };
  });
}

/** What "Ångra" did: the card is back (`restored`, also when it already was), its file is gone, or its place is. */
export type RestoredCard = "restored" | "file_gone" | "place_gone";

/**
 * "Ångra" after "Ta bort kortet": puts the card and its things back with the
 * same ids and times, as a finished card. The file must still be there (it
 * is kept for the undo time; a sweep that took it makes this `file_gone`, and
 * nothing is written). Throws ThingsDataError `restore_failed <code>` or
 * `exists_failed <status>`.
 */
export async function restoreCardIn(db: ThingsDb, card: CardSnapshot): Promise<RestoredCard> {
  return guarded("restore", async () => {
    // The folder's listing, searched for the file: a missing file is an empty list, not an error to read the status of.
    const slash = card.objectPath.lastIndexOf("/");
    const listed = await db.storage
      .from(thingPhotoBucket)
      .list(card.objectPath.slice(0, slash), { limit: 1, search: card.objectPath.slice(slash + 1) });
    if (listed.error) throw new ThingsDataError(`exists_failed ${statusOf(listed.error)}`);
    if (!listed.data.some((entry) => entry.name === card.objectPath.slice(slash + 1))) return "file_gone";
    const photo = await db.from("thing_photo").insert({
      id: card.id,
      place_id: card.placeId,
      object_path: card.objectPath,
      media_type: card.mediaType,
      width: card.width,
      height: card.height,
      taken_at: card.takenAt,
      created_at: card.createdAt,
      status: card.status,
      error_code: card.status === "failed" ? (card.errorCode ?? "ai_job_lost") : null,
      unseen_note: card.unseenNote,
      unseen_count: card.unseenCount,
    });
    if (photo.error) {
      // The card is there already (a second "Ångra", or another tab): fine. The place is gone: the foreign key.
      if (photo.error.code === "23505") return "restored";
      if (photo.error.code === "23503") return "place_gone";
      throw new ThingsDataError(`restore_failed ${photo.error.code}`);
    }
    if (card.things.length > 0) {
      const items = await db.from("thing_item").insert(
        card.things.map((thing) => ({
          id: thing.id,
          photo_id: card.id,
          place_id: card.placeId,
          name: thing.name,
          category: thing.category,
          where_hint: thing.whereHint,
          confidence: thing.confidence,
          position: thing.position,
          created_at: thing.createdAt,
          source: thing.source,
          ...boxColumnsOf(thing),
        })),
      );
      if (items.error) {
        // No card without its things: the row goes again, and the user may try once more.
        await db.from("thing_photo").delete().eq("id", card.id);
        throw new ThingsDataError(`restore_failed ${items.error.code}`);
      }
      // Story 18.6: the merges come back where they still hold, so "Ångra" never brings duplicates back.
      await relinkItemsIn(db, card.things.map((thing) => ({ id: thing.id, sameAs: thing.sameAs, pointedBy: thing.pointedBy })));
    }
    return "restored";
  });
}

/**
 * Removes a removed card's file, once the undo time is out: only when no
 * card has the path any more (a card that "Ångra" put back keeps its file).
 * Never throws; a failure is logged as a reason only and the sweep takes the
 * file later.
 */
export async function removeCardFileIfOrphan(db: ThingsDb, path: string): Promise<void> {
  try {
    const { data, error } = await db.from("thing_photo").select("id").eq("object_path", path).limit(1);
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    if (data.length > 0) return;
    const { failed } = await removeCardFiles(db, [path]);
    if (failed !== null) console.error("things_photo_remove_failed", { reason: failed });
  } catch (error) {
    console.error("things_photo_remove_failed", { reason: error instanceof ThingsDataError ? error.detail : "remove_threw" });
  }
}

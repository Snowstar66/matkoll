import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { isErrorCode } from "@/lib/errors";
import { thingPhotoBucket, thingPhotoMediaTypes, type ThingCard, type ThingPhotoMediaType } from "../domain/thing-photo";
import { cardGoneCode, guarded, ThingsDataError, type ThingsDb } from "./client";

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

export type ReadThing = { name: string; category: string; where: string | null; confidence: string };

/**
 * The job's end (save_thing_reading): the things are saved, the card is `done`
 * and the older cards of the place are removed. Returns the files of the
 * removed cards, for the caller to remove with the Storage API. Throws
 * ThingsDataError `card_gone` (MK440) or `save_failed <code>`.
 */
export async function saveReadingIn(
  db: ThingsDb,
  reading: { photoId: string; things: readonly ReadThing[]; note: string | null; hidden: number },
): Promise<string[]> {
  return guarded("save", async () => {
    const { data, error } = await db.rpc("save_thing_reading", {
      photo: reading.photoId,
      things: reading.things.map((thing) => ({
        name: thing.name,
        category: thing.category,
        where_hint: thing.where,
        confidence: thing.confidence,
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
export async function removeCardFiles(db: ThingsDb, paths: readonly string[]): Promise<{ failed: string | null }> {
  if (paths.length === 0) return { failed: null };
  try {
    const { error } = await db.storage.from(thingPhotoBucket).remove([...paths]);
    return { failed: error ? `remove_failed ${statusOf(error)}` : null };
  } catch {
    return { failed: "remove_threw" };
  }
}

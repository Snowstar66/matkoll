import { z } from "zod";
import type { PlaceCounts } from "../domain/thing-place-edit";
import { thingPhotoBucket } from "../domain/thing-photo";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// Rätta rum och delar (Story 18.16): the counts for the remove sheet
// (thing_place_counts), the removal of one part or box (remove_thing_place), the
// rename of a room with a merge (rename_thing_room, with the files a merge has to
// move) and the rename of one part or box (a plain update of the user's own row).
// The functions are security invoker, so the user's own rows are all they reach.
// Errors carry only a fixed reason and the Postgres code.

/** The Postgres code of a place, room or boende that is gone or not the user's. */
const goneCode = "MK440";

const countsSchema = z.array(z.object({ place_id: z.uuid(), things: z.number().int(), cards: z.number().int() }));

/** What removing each place of the room `roomKey` takes, by place id. Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadPlaceCountsIn(db: ThingsDb, siteId: string, roomKey: string): Promise<Record<string, PlaceCounts>> {
  return guarded("query", async () => {
    const { data, error } = await db.rpc("thing_place_counts", { site: siteId, in_room: roomKey });
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = countsSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return Object.fromEntries(parsed.data.map((row) => [row.place_id, { things: row.things, cards: row.cards }]));
  });
}

const removedSchema = z.object({ things: z.number().int(), cards: z.number().int(), paths: z.array(z.string()), room_left: z.number().int() });

/** Removes a part or a box with its cards and things; gives back what went, the paths of the cards' files and how many places the room has left. `gone` when the place is not there. Throws ThingsDataError `remove_failed <code>` or `invalid_row`. */
export async function removePlaceRowsIn(
  db: ThingsDb,
  placeId: string,
): Promise<{ kind: "removed"; counts: PlaceCounts; paths: string[]; roomLeft: number } | { kind: "gone" }> {
  return guarded("remove", async () => {
    const { data, error } = await db.rpc("remove_thing_place", { place: placeId });
    if (error) {
      if (error.code === goneCode) return { kind: "gone" };
      throw new ThingsDataError(`remove_failed ${error.code}`);
    }
    const parsed = removedSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return { kind: "removed", counts: { things: parsed.data.things, cards: parsed.data.cards }, paths: parsed.data.paths, roomLeft: parsed.data.room_left };
  });
}

const movesSchema = z.array(z.object({ photo: z.uuid(), from_path: z.string(), to_path: z.string() }));

/** The card files a merge of the room `roomKey` into `newKey` has to give new paths. Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadRoomMergeMovesIn(db: ThingsDb, siteId: string, roomKey: string, newKey: string): Promise<{ from: string; to: string }[]> {
  return guarded("query", async () => {
    const { data, error } = await db.rpc("thing_room_merge_moves", { site: siteId, in_room: roomKey, new_key: newKey });
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = movesSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return parsed.data.map((row) => ({ from: row.from_path, to: row.to_path }));
  });
}

/**
 * Copies a card file to its new path; a copy that is there already (a retry) is
 * fine, and so is a source that is gone (404): the card moves without a file, as
 * it showed before. Returns the failure's reason, or `null`. Never throws.
 */
export async function copyCardFile(db: ThingsDb, from: string, to: string): Promise<string | null> {
  try {
    const { error } = await db.storage.from(thingPhotoBucket).copy(from, to);
    if (!error) return null;
    const status = String((error as { statusCode?: string; status?: number }).statusCode ?? (error as { status?: number }).status ?? "unknown");
    return status === "409" || status === "404" ? null : `copy_failed ${status}`;
  } catch {
    return "copy_threw";
  }
}

const renamedRoomSchema = z.object({
  merged: z.number().int(),
  moved: z.number().int(),
  moves: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
});

/** Gives the room its new name, merging it into the room that has the key already. `gone` when the boende or room is not there. Throws ThingsDataError `save_failed <code>` or `invalid_row`. */
export async function renameRoomRowsIn(
  db: ThingsDb,
  input: { siteId: string; roomKey: string; name: string; newKey: string },
): Promise<{ kind: "renamed"; merged: number; moves: { from: string; to: string }[] } | { kind: "gone" }> {
  return guarded("save", async () => {
    const { data, error } = await db.rpc("rename_thing_room", { site: input.siteId, in_room: input.roomKey, new_name: input.name, new_key: input.newKey });
    if (error) {
      if (error.code === goneCode) return { kind: "gone" };
      throw new ThingsDataError(`save_failed ${error.code}`);
    }
    const parsed = renamedRoomSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return { kind: "renamed", merged: parsed.data.merged, moves: parsed.data.moves };
  });
}

/** A part or a box of the user's: what the rename needs to know. `null` when it is gone or not the user's. */
export async function loadPlaceKindIn(db: ThingsDb, id: string): Promise<{ siteId: string; room: string; part: string | null; kind: "part" | "box" } | null> {
  return guarded("query", async () => {
    const { data, error } = await db.from("thing_place").select("site_id, room, part, kind").eq("id", id).maybeSingle();
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    return data ? { siteId: data.site_id, room: data.room, part: data.part, kind: data.kind === "box" ? "box" : "part" } : null;
  });
}

/** Renames a part or a box (`partKey` is its key, with the box prefix on a box). `taken` when the room has a place with the name already, `gone` when the place is not there. Throws ThingsDataError `save_failed <code>`. */
export async function renamePartRowIn(db: ThingsDb, id: string, part: string, partKey: string): Promise<"saved" | "taken" | "gone"> {
  return guarded("save", async () => {
    const { data, error } = await db.from("thing_place").update({ part, part_key: partKey }).eq("id", id).select("id");
    if (error) {
      if (error.code === "23505") return "taken";
      throw new ThingsDataError(`save_failed ${error.code}`);
    }
    return data.length === 0 ? "gone" : "saved";
  });
}

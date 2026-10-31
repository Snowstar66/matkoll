import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { ThingCategory } from "../domain/thing";
import type { WrittenBox, WrittenThing } from "../domain/thing-written";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// The things written by hand into a box (Story 18.13): rows of thing_item with
// source 'manual', a place and no card. Every call goes through the user's
// session client, so RLS limits it to the user's own rows.

/** The Postgres code of a box that is gone or not the user's (replace_box_things). */
const boxGoneCode = "MK440";

/**
 * Replaces the written things of a box with `things` (replace_box_things);
 * what the box's cards show is not touched. `gone` when the box is gone or not
 * the user's. Throws ThingsDataError `save_failed <code>`.
 */
export async function replaceBoxThingsIn(db: ThingsDb, boxId: string, things: readonly WrittenThing[]): Promise<{ kind: "saved"; count: number } | { kind: "gone" }> {
  return guarded("save", async () => {
    const { data, error } = await db.rpc("replace_box_things", { box: boxId, things: things.map((thing) => ({ name: thing.name, category: thing.category })) as Json });
    if (error) {
      if (error.code === boxGoneCode) return { kind: "gone" };
      throw new ThingsDataError(`save_failed ${error.code}`);
    }
    return { kind: "saved", count: typeof data === "number" ? data : things.length };
  });
}

const namesSchema = z.array(z.object({ name: z.string(), category: z.string() }));

/** The written things of a box in the order they were written. Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadWrittenIn(db: ThingsDb, boxId: string): Promise<{ name: string; category: ThingCategory }[]> {
  return guarded("query", async () => {
    const { data, error } = await db.from("thing_item").select("name, category").eq("place_id", boxId).eq("source", "manual").order("position").order("id");
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = namesSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return parsed.data as { name: string; category: ThingCategory }[];
  });
}

const boxesSchema = z.array(z.object({ place_id: z.uuid(), part: z.string().nullable(), things: z.number().int(), written_at: z.string() }));

/** The boxes of a room that have written things, newest first (thing_room_written). */
export async function loadRoomWrittenIn(db: ThingsDb, siteId: string, key: string): Promise<WrittenBox[]> {
  return guarded("query", async () => {
    const { data, error } = await db.rpc("thing_room_written", { site: siteId, in_room: key });
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = boxesSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return parsed.data.map((row) => ({ placeId: row.place_id, part: row.part ?? "", things: row.things, writtenAt: new Date(row.written_at) }));
  });
}

/**
 * Adds things to the finished card `photoId` (add_card_things), after its other
 * things. `gone` when the card is not the user's or not finished, `full` when
 * the card would hold too many. Throws ThingsDataError `save_failed <code>`.
 */
export async function addCardThingsIn(db: ThingsDb, photoId: string, things: readonly WrittenThing[]): Promise<{ kind: "added"; count: number } | { kind: "gone" } | { kind: "full" }> {
  return guarded("save", async () => {
    const { data, error } = await db.rpc("add_card_things", { photo: photoId, things: things.map((thing) => ({ name: thing.name, category: thing.category })) as Json });
    if (error) {
      if (error.code === boxGoneCode) return { kind: "gone" };
      if (error.code === "MK441") return { kind: "full" };
      throw new ThingsDataError(`save_failed ${error.code}`);
    }
    return { kind: "added", count: typeof data === "number" ? data : things.length };
  });
}

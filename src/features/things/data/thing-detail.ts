import { z } from "zod";
import { boxOfRow } from "../domain/thing-card";
import type { ThingDetail } from "../domain/thing-detail";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// The detail of one föremål for its sheet: its card, the box on it and where
// it is kept. Uses the signed-in user's session client, so RLS limits it to
// their own rows (AD-4). Errors carry only a fixed reason and the Postgres code.

const rowSchema = z.object({
  photo_id: z.uuid().nullable(),
  source: z.enum(["photo", "added", "noted"]),
  place_id: z.uuid(),
  box_left: z.number().nullable(),
  box_top: z.number().nullable(),
  box_width: z.number().nullable(),
  box_height: z.number().nullable(),
  thing_place: z.object({ site_id: z.uuid(), room: z.string(), room_key: z.string(), part: z.string().nullable(), kind: z.enum(["part", "box"]) }),
});

const cardThingSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  position: z.number().int(),
  box_left: z.number().nullable(),
  box_top: z.number().nullable(),
  box_width: z.number().nullable(),
  box_height: z.number().nullable(),
});

/** The föremål on card `photoId` in the card's order (the order of its page, so the numbers agree). Throws ThingsDataError. */
async function loadCardThings(db: ThingsDb, photoId: string): Promise<ThingDetail["cardThings"]> {
  const { data, error } = await db.from("thing_item").select("id, name, position, box_left, box_top, box_width, box_height").eq("photo_id", photoId);
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  const parsed = z.array(cardThingSchema).safeParse(data);
  if (!parsed.success) throw new ThingsDataError("invalid_row");
  return [...parsed.data].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)).map((row) => ({ id: row.id, name: row.name, box: boxOfRow(row) }));
}

/** The detail of föremål `id`, or `null` when it is gone or not the user's. Throws ThingsDataError. */
export async function loadThingDetailIn(db: ThingsDb, id: string): Promise<ThingDetail | null> {
  return guarded("query", async () => {
    const { data, error } = await db
      .from("thing_item")
      .select("photo_id, source, place_id, box_left, box_top, box_width, box_height, thing_place!inner(site_id, room, room_key, part, kind)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    if (!data) return null;
    const parsed = rowSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const row = parsed.data;
    return {
      cardThings: row.photo_id ? await loadCardThings(db, row.photo_id) : [],
      photoId: row.photo_id,
      source: row.source,
      box: boxOfRow(row),
      place: {
        id: row.place_id,
        siteId: row.thing_place.site_id,
        room: row.thing_place.room,
        roomKey: row.thing_place.room_key,
        part: row.thing_place.part,
        kind: row.thing_place.kind,
      },
    };
  });
}

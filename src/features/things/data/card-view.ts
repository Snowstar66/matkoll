import { z } from "zod";
import type { ThingBox } from "@/lib/thing-box";
import { shownStatus } from "../domain/thing-photo";
import { boxOfRow, type CardThing, type CardView } from "../domain/thing-card";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// Kortet i stort (Story 18.7): one card with its place and every föremål on it
// (also those merged into a föremål of another card: they are on this photo
// too), and the box of one föremål. Every call uses the signed-in user's
// session client, so RLS limits it to the user's own rows (AD-4). Errors carry
// only a fixed reason and the Postgres code.

const boxColumns = "box_left, box_top, box_width, box_height, box_missed";

const cardViewRowSchema = z.object({
  id: z.uuid(),
  place_id: z.uuid(),
  status: z.enum(["reading", "done", "failed"]),
  created_at: z.string(),
  taken_at: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  thing_place: z.object({ site_id: z.uuid(), room: z.string(), room_key: z.string(), part: z.string().nullable(), kind: z.enum(["part", "box"]) }),
  thing_item: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1),
      where_hint: z.string().nullable(),
      position: z.number().int(),
      box_left: z.number().nullable(),
      box_top: z.number().nullable(),
      box_width: z.number().nullable(),
      box_height: z.number().nullable(),
      box_missed: z.boolean(),
      // Story 18.23; a database before its migration has no such column.
      quantity: z.number().int().nullable().optional(),
    }),
  ),
});

function toCardThing(row: z.output<typeof cardViewRowSchema>["thing_item"][number]): CardThing {
  return { id: row.id, name: row.name, whereHint: row.where_hint, box: boxOfRow(row), boxMissed: row.box_missed, quantity: row.quantity ?? null };
}

/** The card `id` with its place and föremål in the card's order, or `null` when it is gone or not the user's. Throws ThingsDataError. */
export async function loadCardViewIn(db: ThingsDb, id: string, now: Date = new Date()): Promise<CardView | null> {
  return guarded("query", async () => {
    const { data, error } = await db
      .from("thing_photo")
      .select(`id, place_id, status, created_at, taken_at, width, height, thing_place!inner(site_id, room, room_key, part, kind), thing_item(id, name, where_hint, position, quantity, ${boxColumns})`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    if (!data) return null;
    const parsed = cardViewRowSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const row = parsed.data;
    const things = [...row.thing_item].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)).map(toCardThing);
    return {
      id: row.id,
      placeId: row.place_id,
      siteId: row.thing_place.site_id,
      room: row.thing_place.room,
      roomKey: row.thing_place.room_key,
      part: row.thing_place.part,
      kind: row.thing_place.kind,
      status: shownStatus({ status: row.status, createdAt: new Date(row.created_at) }, now),
      takenAt: new Date(row.taken_at).toISOString(),
      width: row.width,
      height: row.height,
      things,
    };
  });
}

const lookupRowSchema = z.object({
  id: z.uuid(),
  photo_id: z.uuid(),
  name: z.string().min(1),
  where_hint: z.string().nullable(),
  box_left: z.number().nullable(),
  box_top: z.number().nullable(),
  box_width: z.number().nullable(),
  box_height: z.number().nullable(),
  box_missed: z.boolean(),
});

/** A föremål on a card, for a lookup of its box. */
export type ThingForLookup = {
  id: string;
  photoId: string;
  name: string;
  whereHint: string | null;
  box: ThingBox | null;
  boxMissed: boolean;
  /** A box is stored (even one the code would not draw): no lookup is made, since its answer could not be saved. */
  boxStored: boolean;
};

/** The föremål `id` when it is the user's and on a card, or `null` (gone, someone else's, or written into a box). Throws ThingsDataError. */
export async function loadThingForLookupIn(db: ThingsDb, id: string): Promise<ThingForLookup | null> {
  return guarded("query", async () => {
    const { data, error } = await db.from("thing_item").select(`id, photo_id, name, where_hint, ${boxColumns}`).eq("id", id).maybeSingle();
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    if (!data || data.photo_id === null) return null;
    const parsed = lookupRowSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const row = parsed.data;
    return {
      id: row.id,
      photoId: row.photo_id,
      name: row.name,
      whereHint: row.where_hint,
      box: boxOfRow(row),
      boxMissed: row.box_missed,
      boxStored: row.box_left !== null,
    };
  });
}

/**
 * Saves the box a lookup found, or that it found nothing (`null`), on a
 * föremål that has neither yet; one that got a box or a miss in the meantime
 * (another tab) keeps it. `false` when nothing was written. Throws ThingsDataError `update_failed <code>`.
 */
export async function saveThingBoxIn(db: ThingsDb, id: string, box: ThingBox | null): Promise<boolean> {
  return guarded("update", async () => {
    const values = box
      ? { box_left: box.left, box_top: box.top, box_width: box.width, box_height: box.height }
      : { box_missed: true };
    const { data, error } = await db.from("thing_item").update(values).eq("id", id).is("box_left", null).eq("box_missed", false).select("id");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data.length > 0;
  });
}

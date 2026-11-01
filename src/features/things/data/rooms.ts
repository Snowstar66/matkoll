import { z } from "zod";
import { thingCategories, thingConfidences, type Thing, type ThingCategory } from "../domain/thing";
import { shownStatus } from "../domain/thing-photo";
import { orderCategories, toRoomThing, type RoomCard, type RoomSummary } from "../domain/thing-room";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// The rooms (Stories 18.11 and 18.12): a room is the distinct room of a
// boende's places. Counts and the things of one category are computed by
// Postgres functions (thing_room_stats, thing_room_categories,
// thing_room_things; security invoker, so RLS limits them to the user's own
// rows), so a page never loads every thing. Errors carry only a fixed reason
// and the Postgres code.

const statsSchema = z.array(
  z.object({
    room: z.string(),
    room_key: z.string(),
    things: z.number().int(),
    cards: z.number().int(),
    reading: z.number().int(),
    latest: z.string().nullable(),
  }),
);

/** The rooms of the boende `siteId` in the order they were made, each counted. Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadRoomsIn(db: ThingsDb, siteId: string): Promise<RoomSummary[]> {
  const { data, error } = await db.rpc("thing_room_stats", { site: siteId });
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  const parsed = statsSchema.safeParse(data);
  if (!parsed.success) throw new ThingsDataError("invalid_row");
  return parsed.data.map((row) => ({
    room: row.room,
    key: row.room_key,
    things: row.things,
    cards: row.cards,
    reading: row.reading,
    latest: row.latest ? new Date(row.latest) : null,
  }));
}

/** One room, or `null` when the boende has no such room. */
export async function loadRoomIn(db: ThingsDb, siteId: string, key: string): Promise<RoomSummary | null> {
  return (await loadRoomsIn(db, siteId)).find((room) => room.key === key) ?? null;
}

const categoriesSchema = z.array(z.object({ category: z.string(), things: z.number().int() }));

/** The categories of a room with their counts, in the order of thingCategories. */
export async function loadRoomCategoriesIn(db: ThingsDb, siteId: string, key: string): Promise<{ category: ThingCategory; things: number }[]> {
  const { data, error } = await db.rpc("thing_room_categories", { site: siteId, in_room: key });
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  const parsed = categoriesSchema.safeParse(data);
  if (!parsed.success) throw new ThingsDataError("invalid_row");
  return orderCategories(parsed.data);
}

const thingsSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string().min(1),
    category: z.enum(thingCategories),
    where_hint: z.string().nullable(),
    confidence: z.enum(thingConfidences),
    part: z.string().nullable(),
    kind: z.enum(["part", "box"]),
    seen_on: z.number().int(),
    // Story 18.19; a database before its migration has no such columns.
    noted: z.boolean().optional(),
    noted_at: z.string().nullable().optional(),
    // Story 18.23; a database before its migration has no such column.
    quantity: z.number().int().nullable().optional(),
  }),
);

/** The kept things of one category of a room (at most 2000), named, with their hints. Throws like loadRoomsIn. */
export async function loadRoomThingsIn(db: ThingsDb, siteId: string, key: string, category: ThingCategory): Promise<Thing[]> {
  const { data, error } = await db.rpc("thing_room_things", { site: siteId, in_room: key, wanted: category });
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  const parsed = thingsSchema.safeParse(data);
  if (!parsed.success) throw new ThingsDataError("invalid_row");
  // Swedish order (å, ä, ö last), whatever the database's collation is; the id breaks a tie.
  const rows = [...parsed.data].sort((a, b) => a.name.localeCompare(b.name, "sv") || (a.id < b.id ? -1 : 1));
  return rows.map((row) =>
    toRoomThing({
      id: row.id,
      name: row.name,
      category: row.category,
      confidence: row.confidence,
      whereHint: row.where_hint,
      part: row.part,
      kind: row.kind,
      seenOn: row.seen_on,
      notedAt: row.noted && row.noted_at ? new Date(row.noted_at).toISOString() : null,
      quantity: row.quantity ?? null,
    }),
  );
}

const cardRowSchema = z.object({
  id: z.uuid(),
  place_id: z.uuid(),
  status: z.enum(["reading", "done", "failed"]),
  taken_at: z.string(),
  created_at: z.string(),
  error_code: z.string().nullable(),
  unseen_note: z.string().nullable(),
  unseen_count: z.number().int(),
  thing_place: z.object({ part: z.string().nullable(), kind: z.enum(["part", "box"]) }),
  thing_item: z.array(z.object({ count: z.number().int() })),
});

/** The cards of a room, newest first, with their place and how many kept things each shows. */
export async function loadRoomCardsIn(db: ThingsDb, siteId: string, key: string, now: Date = new Date()): Promise<(Omit<RoomCard, "label"> & { part: string | null; kind: "part" | "box" })[]> {
  const { data, error } = await db
    .from("thing_photo")
    .select("id, place_id, status, taken_at, created_at, error_code, unseen_note, unseen_count, thing_place!inner(part, kind, site_id, room_key), thing_item(count)")
    .eq("thing_place.site_id", siteId)
    .eq("thing_place.room_key", key)
    .is("thing_item.same_as", null)
    .order("taken_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  return data.map((row) => {
    const parsed = cardRowSchema.safeParse(row);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const r = parsed.data;
    return {
      id: r.id,
      placeId: r.place_id,
      // A card that has been reading for too long has lost its job: it shows as failed.
      status: shownStatus({ status: r.status, createdAt: new Date(r.created_at) }, now),
      things: r.thing_item[0]?.count ?? 0,
      takenAt: new Date(r.taken_at),
      errorCode: r.error_code,
      unseenNote: r.unseen_note,
      unseenCount: r.unseen_count,
      part: r.thing_place.part,
      kind: r.thing_place.kind,
    };
  });
}

/** A place of a room, for the boxes and the whole-room card. */
export type RoomPlace = { id: string; part: string | null; kind: "part" | "box" };

/** The places of a room in the order they were made. */
export async function loadRoomPlacesIn(db: ThingsDb, siteId: string, key: string): Promise<RoomPlace[]> {
  const { data, error } = await db.from("thing_place").select("id, part, kind").eq("site_id", siteId).eq("room_key", key).order("created_at").order("id");
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  return data.map((row) => ({ id: row.id, part: row.part, kind: row.kind === "box" ? "box" : "part" }));
}

/** Whether the place exists; used by ensurePlaceIn to find a place before making one. */
export async function findPlaceIn(db: ThingsDb, target: { siteId: string; roomKey: string; partKey: string }): Promise<string | null> {
  return guarded("query", async () => {
    const { data, error } = await db
      .from("thing_place")
      .select("id")
      .eq("site_id", target.siteId)
      .eq("room_key", target.roomKey)
      .eq("part_key", target.partKey)
      .maybeSingle();
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    return data?.id ?? null;
  });
}

const cardWhereSchema = z.array(z.object({ id: z.uuid(), thing_place: z.object({ site_id: z.uuid(), room_key: z.string() }) }));

/** Where the user's cards `ids` are now (boende and room); a card that is gone, or not the user's, is left out. */
export async function loadCardsWhereIn(db: ThingsDb, ids: readonly string[]): Promise<{ id: string; siteId: string; roomKey: string }[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from("thing_photo").select("id, thing_place!inner(site_id, room_key)").in("id", [...ids]);
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  const parsed = cardWhereSchema.safeParse(data);
  if (!parsed.success) throw new ThingsDataError("invalid_row");
  return parsed.data.map((row) => ({ id: row.id, siteId: row.thing_place.site_id, roomKey: row.thing_place.room_key }));
}

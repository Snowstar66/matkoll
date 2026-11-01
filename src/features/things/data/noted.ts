import { z } from "zod";
import type { ThingCategory } from "../domain/thing";
import { cleanThingName } from "../domain/thing-edit";
import { notedTitle, type RoomParts } from "../domain/thing-noted";
import { normalizePlaceName } from "../domain/thing-place";
import { cardGoneCode, guarded, ThingsDataError, type ThingsDb } from "./client";

// The things written in with where they are (Story 18.19): rows of thing_item
// with source 'noted', a place (a part or the whole room) and no card. Every
// call goes through the user's session client, so RLS limits it to the user's
// own rows. Errors carry only a fixed reason and the Postgres code.

/** The Postgres code of a user with too many noted things (remember_thing). */
const notedFullCode = "MK441";

/**
 * Saves a noted thing in the place `placeId` (remember_thing), removing the
 * noted thing `replaces` when given. `gone` when the place is not the user's
 * or is a box, `full` when the user has too many noted things. Throws
 * ThingsDataError `save_failed <code>`.
 */
export async function rememberThingIn(
  db: ThingsDb,
  input: { placeId: string; name: string; category: ThingCategory; replaces: string | null },
): Promise<{ kind: "saved"; id: string } | { kind: "gone" } | { kind: "full" }> {
  return guarded("save", async () => {
    const { data, error } = await db.rpc("remember_thing", {
      place: input.placeId,
      thing_name: input.name,
      thing_category: input.category,
      ...(input.replaces ? { replaces: input.replaces } : {}),
    });
    if (error) {
      if (error.code === cardGoneCode) return { kind: "gone" };
      if (error.code === notedFullCode) return { kind: "full" };
      throw new ThingsDataError(`save_failed ${error.code}`);
    }
    const id = z.uuid().safeParse(data);
    if (!id.success) throw new ThingsDataError("invalid_row");
    return { kind: "saved", id: id.data };
  });
}

const notedRowsSchema = z.array(
  z.object({ id: z.uuid(), name: z.string(), created_at: z.string(), thing_place: z.object({ room: z.string(), part: z.string().nullable() }) }),
);

/** A LIKE pattern for `text`: %, _ and \ escaped, and PostgREST's * (its %) one character, so the names checked below are never more than the same length. */
function literal(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`).replaceAll("*", "_");
}

/**
 * The user's noted thing named `name` (in any case and spelling of spaces), in
 * any boende, the newest when there are several: the one a new "Kom ihåg" of
 * the same thing moves. `null` when there is none. Throws ThingsDataError.
 */
export async function findNotedIn(db: ThingsDb, name: string): Promise<{ id: string; title: string; notedAt: string } | null> {
  const clean = cleanThingName(name);
  if (clean === "") return null;
  return guarded("query", async () => {
    const { data, error } = await db
      .from("thing_item")
      .select("id, name, created_at, thing_place!inner(room, part)")
      .eq("source", "noted")
      .ilike("name", literal(clean))
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = notedRowsSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const key = normalizePlaceName(clean);
    const row = parsed.data.find((entry) => normalizePlaceName(entry.name) === key);
    return row ? { id: row.id, title: notedTitle(row.thing_place), notedAt: new Date(row.created_at).toISOString() } : null;
  });
}

const placesSchema = z.array(z.object({ room: z.string(), room_key: z.string(), part: z.string().nullable(), kind: z.string(), created_at: z.string() }));

/** The rooms of the boende `siteId` in the order they were made, each with its parts (not its boxes). Throws ThingsDataError. */
export async function loadRoomPartsIn(db: ThingsDb, siteId: string): Promise<RoomParts[]> {
  return guarded("query", async () => {
    const { data, error } = await db.from("thing_place").select("room, room_key, part, kind, created_at").eq("site_id", siteId).order("created_at").order("id");
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = placesSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const rooms = new Map<string, RoomParts>();
    for (const place of parsed.data) {
      const room = rooms.get(place.room_key) ?? { room: place.room, parts: [] };
      rooms.set(place.room_key, room);
      if (place.kind === "part" && place.part && !room.parts.some((part) => normalizePlaceName(part) === normalizePlaceName(place.part ?? ""))) {
        room.parts.push(place.part);
      }
    }
    return [...rooms.values()];
  });
}

/**
 * Story 18.24: the count of a noted thing just saved, with the first line of its history ("4 · Inskrivet").
 * As the signed-in user: the household's RLS lets the föremål and the change be written only in its own
 * household. Throws ThingsDataError `save_failed <code>`.
 */
export async function noteCountIn(db: ThingsDb, itemId: string, count: number): Promise<void> {
  return guarded("save", async () => {
    const updated = await db.from("thing_item").update({ quantity: count }).eq("id", itemId).eq("source", "noted").select("id");
    if (updated.error) throw new ThingsDataError(`save_failed ${updated.error.code}`);
    if ((updated.data ?? []).length === 0) throw new ThingsDataError("save_failed gone");
    const logged = await db.from("thing_change").insert({ item_id: itemId, kind: "noted", quantity_after: count });
    if (logged.error) throw new ThingsDataError(`save_failed ${logged.error.code}`);
  });
}

const kindRowsSchema = z.array(
  z.object({ name: z.string(), created_at: z.string(), thing_place: z.object({ room: z.string(), room_key: z.string(), part: z.string().nullable(), part_key: z.string(), kind: z.string() }) }),
);

/**
 * Story 18.24: where the föremål of `category` in the boende `siteId` mostly are: the part (or whole room) that
 * holds most of them, the newest breaking a tie, with the name of one of them ("som gravljusen"). Not a box: a
 * noted thing is never put in one. `null` when there is none. Throws ThingsDataError.
 */
export async function findCategoryPlaceIn(db: ThingsDb, siteId: string, category: ThingCategory): Promise<{ room: string; part: string | null; name: string } | null> {
  return guarded("query", async () => {
    const { data, error } = await db
      .from("thing_item")
      .select("name, created_at, thing_place!inner(room, room_key, part, part_key, kind)")
      .eq("category", category)
      .is("same_as", null)
      .eq("thing_place.site_id", siteId)
      .eq("thing_place.kind", "part")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = kindRowsSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    // Newest first, so the first row of a place is its newest föremål, and a tie keeps the place seen first.
    const places = new Map<string, { room: string; part: string | null; name: string; count: number }>();
    for (const row of parsed.data) {
      const key = `${row.thing_place.room_key}|${row.thing_place.part_key}`;
      const place = places.get(key);
      if (place) place.count += 1;
      else places.set(key, { room: row.thing_place.room, part: row.thing_place.part, name: row.name, count: 1 });
    }
    let best: { room: string; part: string | null; name: string; count: number } | null = null;
    for (const place of places.values()) if (!best || place.count > best.count) best = place;
    return best ? { room: best.room, part: best.part, name: best.name } : null;
  });
}

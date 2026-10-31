import { z } from "zod";
import {
  boxKey,
  cleanPlaceName,
  isBoxKey,
  maxPlacesPerSite,
  normalizePlaceName,
  type ThingPlace,
  type ValidPlaceInput,
} from "../domain/thing-place";
import { shownStatus } from "../domain/thing-photo";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// The places (Story 18.1): every call to thing_place is here, and the things
// module alone makes them (AD-1). Every function needs the signed-in user's
// session client, never an admin client, so RLS limits it to the user's own
// rows (AD-4). Errors carry only a fixed reason and the Postgres code.

const placeSelect = "id, site_id, room, part, part_key, kind, created_at, thing_photo(id, status, taken_at, created_at), thing_item(count)";

const placeRowSchema = z.object({
  id: z.uuid(),
  site_id: z.uuid(),
  room: z.string(),
  part: z.string().nullable(),
  part_key: z.string(),
  kind: z.enum(["part", "box"]),
  created_at: z.string(),
  thing_photo: z.array(
    z.object({ id: z.uuid(), status: z.enum(["reading", "done", "failed"]), taken_at: z.string(), created_at: z.string() }),
  ),
  thing_item: z.array(z.object({ count: z.number().int() })),
});

/** A thing_place row with its cards and its things counted, as a ThingPlace. */
function toPlace(row: unknown, now: Date): ThingPlace {
  const parsed = placeRowSchema.safeParse(row);
  if (!parsed.success) throw new ThingsDataError("invalid_row");
  const { thing_photo: photos, thing_item: items } = parsed.data;
  // Newest first; the id breaks a tie like the queue does.
  const newest = [...photos].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : -1));
  const latest = newest[0];
  const done = newest.find((photo) => photo.status === "done");
  return {
    id: parsed.data.id,
    siteId: parsed.data.site_id,
    room: parsed.data.room,
    part: parsed.data.part,
    isBox: parsed.data.kind === "box" || isBoxKey(parsed.data.part_key),
    itemCount: items[0]?.count ?? 0,
    cardTakenAt: done ? new Date(done.taken_at) : null,
    cardState: latest ? shownStatus({ status: latest.status, createdAt: new Date(latest.created_at) }, now) : "none",
  };
}

/**
 * The places of the boende `siteId`, in the order they were made, each with
 * the number of things on it and the state of its latest card. Throws
 * ThingsDataError `query_failed <code>` or `invalid_row`.
 */
export async function loadPlacesIn(db: ThingsDb, siteId: string, now: Date = new Date()): Promise<ThingPlace[]> {
  // Only the kept things are counted (Story 18.6): a thing merged into another card counts there.
  const { data, error } = await db.from("thing_place").select(placeSelect).eq("site_id", siteId).is("thing_item.same_as", null).order("created_at").order("id");
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  return data.map((row) => toPlace(row, now));
}

/** One place, or `null` when it is gone or not the user's. Throws like loadPlacesIn. */
export async function loadPlaceIn(db: ThingsDb, id: string, now: Date = new Date()): Promise<ThingPlace | null> {
  const { data, error } = await db.from("thing_place").select(placeSelect).eq("id", id).is("thing_item.same_as", null).maybeSingle();
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  return data ? toPlace(data, now) : null;
}

/** What saving a place did: it is `saved`, or the same room and part are there already (`taken`), or the boende is gone, or it has too many places. */
export type SavedPlace = { kind: "saved"; id: string } | { kind: "taken" } | { kind: "site_gone" } | { kind: "limit" };

/** Makes a place in the boende `input.siteId`; with `box` its part is a box's name (Story 18.5). Throws ThingsDataError `save_failed <code>` or `save_threw`. */
export async function insertPlaceIn(db: ThingsDb, input: ValidPlaceInput, box = false): Promise<SavedPlace> {
  return guarded("save", async () => {
    const count = await db.from("thing_place").select("id", { count: "exact", head: true }).eq("site_id", input.siteId);
    if (count.error) throw new ThingsDataError(`save_failed ${count.error.code}`);
    if ((count.count ?? 0) >= maxPlacesPerSite) return { kind: "limit" };
    // A room that is there already keeps its spelling, so "skräpförrådet" joins "Skräpförrådet" instead of making a second heading.
    const known = await db.from("thing_place").select("room").eq("site_id", input.siteId).eq("room_key", normalizePlaceName(input.room)).limit(1);
    if (known.error) throw new ThingsDataError(`save_failed ${known.error.code}`);
    const { data, error } = await db
      .from("thing_place")
      .insert({
        site_id: input.siteId,
        room: known.data[0]?.room ?? cleanPlaceName(input.room),
        part: input.part,
        room_key: normalizePlaceName(input.room),
        part_key: input.part === null ? "" : box ? boxKey(input.part) : normalizePlaceName(input.part),
        kind: box ? "box" : "part",
      })
      .select("id")
      .single();
    if (error) {
      // The unique key on the normalized names, and the foreign key to the boende.
      if (error.code === "23505") return { kind: "taken" };
      if (error.code === "23503") return { kind: "site_gone" };
      throw new ThingsDataError(`save_failed ${error.code}`);
    }
    return { kind: "saved", id: data.id };
  });
}

import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { thingCategories } from "../domain/thing";
import type { MergeCandidate } from "../domain/thing-merge";
import { partLabel } from "../domain/thing-place";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// The overlap merge's reads and its one write (Story 18.6): the things of a
// finished card and of the room's other current cards, and merge_thing_items,
// which points the card's things at the ones they are the same as. Through the
// user's session client, so RLS limits it to the user's own rows (AD-4).

/** What the model is asked about: the room, the card, and the things on both sides. */
export type MergeInputRows = {
  room: string;
  cardTitle: string;
  added: MergeCandidate[];
  existing: (MergeCandidate & { card: string })[];
};

const itemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: z.enum(thingCategories),
  where_hint: z.string().nullable(),
  position: z.number().int(),
  same_as: z.uuid().nullable(),
});

const roomSchema = z.object({
  id: z.uuid(),
  room: z.string(),
  part: z.string().nullable(),
  kind: z.enum(["part", "box"]),
  site_id: z.uuid(),
  room_key: z.string(),
  thing_photo: z.array(
    z.object({ id: z.uuid(), status: z.enum(["reading", "done", "failed"]), created_at: z.string(), thing_item: z.array(itemSchema) }),
  ),
});

const placeColumns = "id, room, part, kind, site_id, room_key";

const bySort = (a: z.infer<typeof itemSchema>, b: z.infer<typeof itemSchema>) => a.position - b.position || (a.id < b.id ? -1 : 1);

/**
 * The things to compare for the finished card `photoId`: its own things that
 * are not merged yet, and the kept things of the newest finished card of every
 * other place in the same room (a part or the whole room, never a box). `null`
 * when the card's place is a box or is gone. Throws ThingsDataError
 * `query_failed <code>` or `invalid_row`.
 */
export async function loadMergeInputIn(db: ThingsDb, photoId: string): Promise<MergeInputRows | null> {
  return guarded("query", async () => {
    const card = await db.from("thing_photo").select(`place_id, thing_place(${placeColumns})`).eq("id", photoId).maybeSingle();
    if (card.error) throw new ThingsDataError(`query_failed ${card.error.code}`);
    const own = z.object({ place_id: z.uuid(), thing_place: z.object({ id: z.uuid(), room: z.string(), part: z.string().nullable(), kind: z.enum(["part", "box"]), site_id: z.uuid(), room_key: z.string() }) }).safeParse(card.data);
    if (card.data && !own.success) throw new ThingsDataError("invalid_row");
    if (!own.success || own.data.thing_place.kind === "box") return null;
    const place = own.data.thing_place;

    const rows = await db
      .from("thing_place")
      .select(`${placeColumns}, thing_photo(id, status, created_at, thing_item(id, name, category, where_hint, position, same_as))`)
      .eq("site_id", place.site_id)
      .eq("room_key", place.room_key)
      .eq("kind", "part")
      .order("created_at")
      .order("id");
    if (rows.error) throw new ThingsDataError(`query_failed ${rows.error.code}`);

    const added: MergeCandidate[] = [];
    const existing: (MergeCandidate & { card: string })[] = [];
    for (const row of rows.data) {
      const parsed = roomSchema.safeParse(row);
      if (!parsed.success) throw new ThingsDataError("invalid_row");
      const done = parsed.data.thing_photo.filter((photo) => photo.status === "done");
      if (parsed.data.id === place.id) {
        const mine = done.find((photo) => photo.id === photoId);
        for (const item of [...(mine?.thing_item ?? [])].sort(bySort)) {
          if (item.same_as === null) added.push({ id: item.id, name: item.name, category: item.category, where: item.where_hint });
        }
        continue;
      }
      // Newest finished card; the id breaks a tie like the page does.
      const newest = done.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : -1))[0];
      for (const item of [...(newest?.thing_item ?? [])].sort(bySort)) {
        if (item.same_as === null) existing.push({ id: item.id, name: item.name, category: item.category, where: item.where_hint, card: partLabel(parsed.data) });
      }
    }
    return { room: place.room, cardTitle: partLabel(place), added, existing };
  });
}

/** The ids of the things that point at each of `ids` (the things they were merged into), for "Ångra". Throws ThingsDataError `query_failed <code>`. */
export async function loadPointersIn(db: ThingsDb, ids: readonly string[]): Promise<Map<string, string[]>> {
  const pointers = new Map<string, string[]>();
  if (ids.length === 0) return pointers;
  const { data, error } = await db.from("thing_item").select("id, same_as").in("same_as", [...ids]);
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  for (const row of data) if (row.same_as) pointers.set(row.same_as, [...(pointers.get(row.same_as) ?? []), row.id]);
  return pointers;
}

/** What "Ångra" gives back about a restored thing's links (relink_thing_items). */
export type ThingLink = { id: string; sameAs: string | null; pointedBy: readonly string[] };

/** Puts back the links of restored things, where they still hold (relink_thing_items); returns how many. Never throws: the things are back either way, and a failure is only logged (`things_relink_failed`). */
export async function relinkItemsIn(db: ThingsDb, links: readonly ThingLink[]): Promise<number> {
  const wanted = links.filter((link) => link.sameAs !== null || link.pointedBy.length > 0);
  if (wanted.length === 0) return 0;
  try {
    const { data, error } = await db.rpc("relink_thing_items", {
      links: wanted.map((link) => ({ id: link.id, same_as: link.sameAs, pointed_by: [...link.pointedBy] })) as Json,
    });
    if (error) throw new ThingsDataError(`relink_failed ${error.code}`);
    return typeof data === "number" ? data : 0;
  } catch (error) {
    console.error("things_relink_failed", { reason: error instanceof ThingsDataError ? error.detail : "threw" });
    return 0;
  }
}

/** Points the card's things at the kept things they are the same as (merge_thing_items); returns how many were merged. Throws ThingsDataError `merge_failed <code>`. */
export async function mergeItemsIn(db: ThingsDb, photoId: string, rows: readonly { item: string; target: string }[]): Promise<number> {
  return guarded("merge", async () => {
    const { data, error } = await db.rpc("merge_thing_items", { photo: photoId, pairs: rows as unknown as Json });
    if (error) throw new ThingsDataError(`merge_failed ${error.code}`);
    return typeof data === "number" ? data : 0;
  });
}

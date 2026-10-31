import { z } from "zod";
import { thingCategories } from "../domain/thing";
import { isBoxKey } from "../domain/thing-place";
import { maxIndexedThings, type IndexedPlace } from "../domain/thing-search";
import { ThingsDataError, type ThingsDb } from "./client";

// The index of the things (Story 18.4): every place with the things of its
// latest finished card, for the search in the browser and for the question to
// the AI. One read through the user's session client, so RLS limits it to the
// user's own rows (AD-4).

const select =
  "id, site_id, room, part, part_key, created_at, pantry_site(name), thing_photo(id, status, taken_at, created_at, unseen_count, thing_item(id, name, category, where_hint, position))";

const rowSchema = z.object({
  id: z.uuid(),
  site_id: z.uuid(),
  room: z.string(),
  part: z.string().nullable(),
  part_key: z.string(),
  created_at: z.string(),
  pantry_site: z.object({ name: z.string() }).nullable(),
  thing_photo: z.array(
    z.object({
      id: z.uuid(),
      status: z.enum(["reading", "done", "failed"]),
      taken_at: z.string(),
      created_at: z.string(),
      unseen_count: z.number().int(),
      thing_item: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          category: z.enum(thingCategories),
          where_hint: z.string().nullable(),
          position: z.number().int(),
        }),
      ),
    }),
  ),
});

/**
 * The places that have a finished card, in the order they were made, each with
 * the things of its newest finished card in the model's order (at most
 * maxIndexedThings in all). Throws ThingsDataError `query_failed <code>` or `invalid_row`.
 */
export async function loadThingIndexIn(db: ThingsDb): Promise<IndexedPlace[]> {
  const { data, error } = await db.from("thing_place").select(select).order("created_at").order("id");
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  const places: IndexedPlace[] = [];
  let count = 0;
  for (const row of data) {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const { thing_photo: photos } = parsed.data;
    // Newest first; the id breaks a tie like the queue does.
    const card = photos
      .filter((photo) => photo.status === "done")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : -1))[0];
    if (!card) continue;
    const things = [...card.thing_item]
      .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
      .slice(0, Math.max(0, maxIndexedThings - count))
      .map((item) => ({ id: item.id, name: item.name, category: item.category, whereHint: item.where_hint }));
    count += things.length;
    places.push({
      id: parsed.data.id,
      siteId: parsed.data.site_id,
      siteName: parsed.data.pantry_site?.name ?? "",
      room: parsed.data.room,
      part: parsed.data.part,
      isBox: isBoxKey(parsed.data.part_key),
      cardTakenAt: new Date(card.taken_at),
      hidden: card.unseen_count,
      things,
    });
  }
  return places;
}

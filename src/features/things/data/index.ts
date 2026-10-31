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
  "id, site_id, room, part, part_key, kind, created_at, pantry_site(name), thing_photo(id, status, taken_at, created_at, unseen_count, thing_item(id, name, category, where_hint, position, same_as))";

const rowSchema = z.object({
  id: z.uuid(),
  site_id: z.uuid(),
  room: z.string(),
  part: z.string().nullable(),
  part_key: z.string(),
  kind: z.enum(["part", "box"]),
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
          same_as: z.uuid().nullable(),
        }),
      ),
    }),
  ),
});

/**
 * The places that have a finished card, in the order they were made, each with
 * the things of its newest finished card in the model's order (at most
 * maxIndexedThings in all). A thing merged into another card (Story 18.6) is
 * left out and counted on the kept one, so every thing is listed once, with
 * the number of cards it is seen on. Throws ThingsDataError `query_failed <code>` or `invalid_row`.
 */
export async function loadThingIndexIn(db: ThingsDb): Promise<IndexedPlace[]> {
  const { data, error } = await db.from("thing_place").select(select).order("created_at").order("id");
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  // How many other rows point at each kept thing (its cards are itself and these).
  const pointing = await db.from("thing_item").select("same_as").not("same_as", "is", null);
  if (pointing.error) throw new ThingsDataError(`query_failed ${pointing.error.code}`);
  const cards = new Map<string, number>();
  for (const { same_as } of pointing.data) if (same_as) cards.set(same_as, (cards.get(same_as) ?? 0) + 1);
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
    // A card whose things were all merged into other cards has nothing to list.
    const things = card.thing_item
      .filter((item) => item.same_as === null)
      .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
      .slice(0, Math.max(0, maxIndexedThings - count))
      .map((item) => ({ id: item.id, name: item.name, category: item.category, whereHint: item.where_hint, seenOn: 1 + (cards.get(item.id) ?? 0) }));
    count += things.length;
    if (card.thing_item.length > 0 && card.thing_item.every((item) => item.same_as !== null)) continue;
    places.push({
      id: parsed.data.id,
      siteId: parsed.data.site_id,
      siteName: parsed.data.pantry_site?.name ?? "",
      room: parsed.data.room,
      part: parsed.data.part,
      isBox: parsed.data.kind === "box" || isBoxKey(parsed.data.part_key),
      cardTakenAt: new Date(card.taken_at),
      hidden: card.unseen_count,
      things,
    });
  }
  return places;
}

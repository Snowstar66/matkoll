import { z } from "zod";
import { maxHits, searchRowsSchema, toHit, type ThingHit } from "../domain/thing-search";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// The search of the things (Stories 18.4 and 18.14): search_things finds the
// kept things whose name holds a term or is close to it (pg_trgm, so a typo or
// an ending is fine), scoped to the signed-in user by RLS. Nothing loads every
// thing. Errors carry only a fixed reason and the Postgres code.

/** The things matching any of `terms`, best first, at most `limit` (and maxHits). Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function searchThingsIn(db: ThingsDb, terms: readonly string[], limit: number = maxHits): Promise<ThingHit[]> {
  if (terms.length === 0) return [];
  return guarded("query", async () => {
    const { data, error } = await db.rpc("search_things", { terms: [...terms], max_hits: Math.min(limit, maxHits) });
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = searchRowsSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return parsed.data.map(toHit);
  });
}

const unseenSchema = z.array(z.object({ site_id: z.uuid(), room: z.string(), room_key: z.string(), unseen: z.number().int() }));

/** The rooms with closed containers or empty boxes (thing_unseen_by_room), with how many. */
export async function loadUnseenIn(db: ThingsDb): Promise<{ siteId: string; room: string; roomKey: string; count: number }[]> {
  return guarded("query", async () => {
    const { data, error } = await db.rpc("thing_unseen_by_room");
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = unseenSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return parsed.data.map((row) => ({ siteId: row.site_id, room: row.room, roomKey: row.room_key, count: row.unseen }));
  });
}

/** How many boenden the user has (Story 18.23: a count answer names the boende when there is more than one). Throws ThingsDataError `query_failed <code>`. */
export async function countSitesIn(db: ThingsDb): Promise<number> {
  return guarded("query", async () => {
    const { count, error } = await db.from("pantry_site").select("id", { count: "exact", head: true });
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    return count ?? 0;
  });
}

import { z } from "zod";
import type { ClearCounts } from "../domain/thing-clear";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// "Rensa rummet" and "Rensa förrådet" (Story 18.15): the counts for the sheet
// (thing_clear_counts) and the clearing itself (clear_things), both security
// invoker, so the user's own rows are all they can reach. Nothing here touches
// the pantry. Errors carry only a fixed reason and the Postgres code.

/** The Postgres code of a boende or room that is gone or not the user's (clear_things). */
const goneCode = "MK440";

const countsSchema = z.array(z.object({ things: z.number().int(), cards: z.number().int(), boxes: z.number().int() }));

/** What clearing the room `roomKey` of the boende `siteId` (or, without it, the whole boende) removes. Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadClearCountsIn(db: ThingsDb, siteId: string, roomKey?: string): Promise<ClearCounts> {
  return guarded("query", async () => {
    const { data, error } = await db.rpc("thing_clear_counts", { site: siteId, in_room: roomKey });
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    const parsed = countsSchema.safeParse(data);
    if (!parsed.success || !parsed.data[0]) throw new ThingsDataError("invalid_row");
    return parsed.data[0];
  });
}

const clearedSchema = z.object({ things: z.number().int(), cards: z.number().int(), boxes: z.number().int(), paths: z.array(z.string()) });

/**
 * Removes the room's places (or the whole boende's Förråd) with their cards,
 * things and boxes; gives back what went and the paths of the removed cards'
 * files, for the caller to remove with the Storage API. `gone` when the boende
 * or room is not there. Throws ThingsDataError `remove_failed <code>` or `invalid_row`.
 */
export async function clearThingsIn(db: ThingsDb, siteId: string, roomKey?: string): Promise<{ kind: "cleared"; counts: ClearCounts; paths: string[] } | { kind: "gone" }> {
  return guarded("remove", async () => {
    const { data, error } = await db.rpc("clear_things", { site: siteId, in_room: roomKey });
    if (error) {
      if (error.code === goneCode) return { kind: "gone" };
      throw new ThingsDataError(`remove_failed ${error.code}`);
    }
    const parsed = clearedSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const { paths, ...counts } = parsed.data;
    return { kind: "cleared", counts, paths };
  });
}

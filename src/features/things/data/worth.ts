import { z } from "zod";
import type { ThingBox } from "@/lib/thing-box";
import { boxOfRow } from "../domain/thing-card";
import { worthOfRow, worthRowShape, type ThingWorth } from "../domain/thing-worth";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// Värt en titt, "Förklara närmare": the föremål as the explanation needs it, and the explanation kept on it. Every
// call uses the signed-in user's session client, so RLS limits it to the user's own rows (AD-4). Errors carry only a
// fixed reason and the Postgres code.

const rowSchema = z.object({
  id: z.uuid(),
  photo_id: z.uuid().nullable(),
  name: z.string().min(1),
  box_left: z.number().nullable(),
  box_top: z.number().nullable(),
  box_width: z.number().nullable(),
  box_height: z.number().nullable(),
  ...worthRowShape,
});

/** A föremål with a tip, for the explanation. */
export type ThingForWorth = { id: string; photoId: string; name: string; box: ThingBox | null; worth: ThingWorth };

/** The föremål `id` when it is the user's, on a card and has a tip, or `null`. Throws ThingsDataError. */
export async function loadThingForWorthIn(db: ThingsDb, id: string): Promise<ThingForWorth | null> {
  return guarded("query", async () => {
    const { data, error } = await db
      .from("thing_item")
      .select("id, photo_id, name, box_left, box_top, box_width, box_height, worth_why, worth_confidence, worth_detail")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    if (!data || data.photo_id === null) return null;
    const parsed = rowSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const row = parsed.data;
    const worth = worthOfRow(row);
    if (!worth || row.photo_id === null) return null;
    return { id: row.id, photoId: row.photo_id, name: row.name, box: boxOfRow(row), worth };
  });
}

/**
 * Keeps the explanation on a föremål that has a tip and none yet; one that got an explanation in the meantime (another
 * tab) keeps it. `false` when nothing was written. Throws ThingsDataError `update_failed <code>`.
 */
export async function saveWorthDetailIn(db: ThingsDb, id: string, text: string): Promise<boolean> {
  return guarded("update", async () => {
    const { data, error } = await db.from("thing_item").update({ worth_detail: text }).eq("id", id).not("worth_why", "is", null).is("worth_detail", null).select("id");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data.length > 0;
  });
}

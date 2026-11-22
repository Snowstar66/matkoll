import { z } from "zod";
import type { ThingBox } from "@/lib/thing-box";
import { boxOfRow } from "../domain/thing-card";
import { worthRowShape, worthStateOfRow, type WorthConfidence, type WorthState } from "../domain/thing-worth";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// Värdetips, "Undersök värdet": the föremål as the assessment needs it, and what it keeps on the föremål (the explanation,
// and the star when the user has not chosen). Every call uses the signed-in user's session client, so RLS limits it to
// the household's own rows (AD-4). Errors carry only a fixed reason and the Postgres code.

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

/** A föremål on a card, for the assessment: its star (and who set it), the AI's tip if it has one, and the kept explanation. */
export type ThingForWorth = { id: string; photoId: string; name: string; box: ThingBox | null; state: WorthState; userChoice: boolean | null };

/** The föremål `id` when it is the household's and on a card, or `null`. It needs no tip. Throws ThingsDataError. */
export async function loadThingForWorthIn(db: ThingsDb, id: string): Promise<ThingForWorth | null> {
  return guarded("query", async () => {
    const { data, error } = await db
      .from("thing_item")
      .select("id, photo_id, name, box_left, box_top, box_width, box_height, worth_why, worth_confidence, worth_detail, worth_set_by_user")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    if (!data || data.photo_id === null) return null;
    const parsed = rowSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    const row = parsed.data;
    if (row.photo_id === null) return null;
    return { id: row.id, photoId: row.photo_id, name: row.name, box: boxOfRow(row), state: worthStateOfRow(row), userChoice: row.worth_set_by_user ?? null };
  });
}

/**
 * Keeps the explanation on a föremål. Without `replace` only one that has none yet (another tab may have got there first);
 * with it (Uppdatera) any. `false` when nothing was written. Throws ThingsDataError `update_failed <code>`.
 */
export async function saveWorthDetailIn(db: ThingsDb, id: string, text: string, replace = false): Promise<boolean> {
  return guarded("update", async () => {
    const query = db.from("thing_item").update({ worth_detail: text }).eq("id", id);
    const { data, error } = await (replace ? query : query.is("worth_detail", null)).select("id");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data.length > 0;
  });
}

/**
 * The AI's recommendation on the star, only for a föremål the user never touched (worth_set_by_user is null, checked in
 * the same statement): a tip stars it, `null` takes the tip away. The user's own choice is never changed here.
 * `false` when the user's choice stopped it. Throws ThingsDataError `update_failed <code>`.
 */
export async function applyWorthRecommendationIn(db: ThingsDb, id: string, tip: { why: string; confidence: WorthConfidence } | null): Promise<boolean> {
  return guarded("update", async () => {
    const values = tip ? { worth_why: tip.why, worth_confidence: tip.confidence } : { worth_why: null, worth_confidence: null };
    const { data, error } = await db.from("thing_item").update(values).eq("id", id).is("worth_set_by_user", null).select("id");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data.length > 0;
  });
}

/** The user's own choice about the star: true stars, false removes (also an AI tip's). `false` when the föremål is gone. Throws ThingsDataError. */
export async function setWorthByUserIn(db: ThingsDb, id: string, starred: boolean): Promise<WorthState | null> {
  return guarded("update", async () => {
    const { data, error } = await db
      .from("thing_item")
      .update({ worth_set_by_user: starred })
      .eq("id", id)
      .select("worth_why, worth_confidence, worth_detail, worth_set_by_user")
      .maybeSingle();
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data ? worthStateOfRow(data) : null;
  });
}

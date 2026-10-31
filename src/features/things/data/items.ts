import { thingRowSchema, toThing, type Thing } from "../domain/thing";
import { ThingsDataError, type ThingsDb } from "./client";

/** The things of a card, in the model's order. Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadThingsIn(db: ThingsDb, photoId: string): Promise<Thing[]> {
  const { data, error } = await db
    .from("thing_item")
    .select("id, name, category, where_hint, confidence, position")
    .eq("photo_id", photoId)
    .order("position")
    .order("id");
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  return data.map((row) => {
    const parsed = thingRowSchema.safeParse(row);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return toThing(parsed.data);
  });
}

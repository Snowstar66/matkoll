import { thingRowSchema, toThing, type Thing } from "../domain/thing";
import type { ThingSnapshot } from "../domain/thing-edit";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

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

/** Renames a thing; nothing else of it or of its card changes. `false` when it is gone or not the user's. Throws ThingsDataError `update_failed <code>`. */
export async function renameItemIn(db: ThingsDb, id: string, name: string): Promise<boolean> {
  return guarded("update", async () => {
    const { data, error } = await db.from("thing_item").update({ name }).eq("id", id).select("id");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data.length > 0;
  });
}

/**
 * Deletes one thing and gives it back as it was, for "Ångra"; the card is not
 * touched. `null` when it is gone or not the user's. Throws ThingsDataError
 * `remove_failed <code>`, `query_failed <code>` or `invalid_row`.
 */
export async function removeItemIn(db: ThingsDb, id: string): Promise<ThingSnapshot | null> {
  return guarded("remove", async () => {
    const { data, error } = await db
      .from("thing_item")
      .delete()
      .eq("id", id)
      .select("id, photo_id, place_id, name, category, where_hint, confidence, position, created_at");
    if (error) throw new ThingsDataError(`remove_failed ${error.code}`);
    const [row] = data;
    if (!row) return null;
    const parsed = thingRowSchema.safeParse(row);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return {
      id: parsed.data.id,
      photoId: row.photo_id,
      placeId: row.place_id,
      name: parsed.data.name,
      category: parsed.data.category,
      whereHint: parsed.data.where_hint,
      confidence: parsed.data.confidence,
      position: parsed.data.position,
      createdAt: new Date(row.created_at).toISOString(),
    };
  });
}

/** "Ångra" on a removed thing: puts it back with the same id and time. `gone` when its card is gone (the foreign key). */
export async function restoreItemIn(db: ThingsDb, thing: ThingSnapshot): Promise<"restored" | "gone"> {
  return guarded("restore", async () => {
    const { error } = await db.from("thing_item").insert({
      id: thing.id,
      photo_id: thing.photoId,
      place_id: thing.placeId,
      name: thing.name,
      category: thing.category,
      where_hint: thing.whereHint,
      confidence: thing.confidence,
      position: thing.position,
      created_at: thing.createdAt,
    });
    if (!error || error.code === "23505") return "restored";
    if (error.code === "23503") return "gone";
    throw new ThingsDataError(`restore_failed ${error.code}`);
  });
}

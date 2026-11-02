import { thingRowSchema, toThing, type Thing, type ThingCategory } from "../domain/thing";
import type { ThingSnapshot } from "../domain/thing-edit";
import { boxColumnsOf, boxOfRow } from "../domain/thing-card";
import { countSnapshotSchema } from "../domain/thing-count";
import { loadPointersIn, relinkItemsIn } from "./merge";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

/** The things of a card, in the model's order. Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadThingsIn(db: ThingsDb, photoId: string): Promise<Thing[]> {
  const { data, error } = await db
    .from("thing_item")
    .select("id, name, category, where_hint, confidence, position, same_as")
    .eq("photo_id", photoId)
    .order("position")
    .order("id");
  if (error) throw new ThingsDataError(`query_failed ${error.code}`);
  // Story 18.6: a thing seen on several cards of the room says so. The kept thing is the card's own or the one it points at; its cards are itself and the things that point at it.
  const kept = [...new Set(data.map((row) => row.same_as ?? row.id))];
  const pointing = kept.length === 0 ? { data: [], error: null } : await db.from("thing_item").select("same_as").in("same_as", kept);
  if (pointing.error) throw new ThingsDataError(`query_failed ${pointing.error.code}`);
  const cards = new Map<string, number>();
  for (const { same_as } of pointing.data) if (same_as) cards.set(same_as, (cards.get(same_as) ?? 0) + 1);
  return data.map((row) => {
    const parsed = thingRowSchema.safeParse(row);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return toThing(parsed.data, 1 + (cards.get(row.same_as ?? row.id) ?? 0));
  });
}

/** Renames a thing; nothing else of it or of its card changes. `false` when it is gone or not the user's. Throws ThingsDataError `update_failed <code>`. */
export async function renameItemIn(db: ThingsDb, id: string, name: string): Promise<boolean> {
  return guarded("update", async () => {
    // A lookup that missed under the old name may find it under the new one (Story 18.7).
    const { data, error } = await db.from("thing_item").update({ name, box_missed: false }).eq("id", id).select("id");
    if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    return data.length > 0;
  });
}

/** The fields of a thing that "Spara" in its sheet changes. */
export type ThingUpdate = { name: string; category: ThingCategory; whereHint: string | null };

/** Changes the name, the category and the "where" of a thing; its card and the other things are not touched. `false` when it is gone or not the user's. Throws ThingsDataError `update_failed <code>`. */
export async function updateItemIn(db: ThingsDb, id: string, update: ThingUpdate): Promise<boolean> {
  return guarded("update", async () => {
    const { data, error } = await db.from("thing_item").update({ name: update.name, category: update.category, where_hint: update.whereHint, box_missed: false }).eq("id", id).select("id");
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
    // The things merged into this one, before they become kept things of their own (FK set null).
    const pointers = await loadPointersIn(db, [id]);
    // Story 18.23: its history, which goes with it, for "Ångra".
    const history = await db
      .from("thing_change")
      .select("kind, delta, quantity_after, cleared, created_at, user_id")
      .eq("item_id", id)
      .order("created_at")
      .order("id")
      .limit(50);
    if (history.error) throw new ThingsDataError(`query_failed ${history.error.code}`);
    const changes = countSnapshotSchema.shape.changes.safeParse(history.data);
    if (!changes.success) throw new ThingsDataError("invalid_row");
    const { data, error } = await db
      .from("thing_item")
      .delete()
      .eq("id", id)
      // A thing written into a box (Story 18.13) has no card; it is changed by editing the box's text, never removed alone.
      // A noted thing (Story 18.19) has no card either, and is removed alone like a thing of a card.
      .in("source", ["photo", "added", "noted"])
      .select("id, photo_id, place_id, name, category, where_hint, confidence, position, created_at, same_as, source, box_left, box_top, box_width, box_height, box_missed, quantity");
    if (error) throw new ThingsDataError(`remove_failed ${error.code}`);
    const [row] = data;
    if (!row) return null;
    const noted = row.source === "noted";
    if (!noted && row.photo_id === null) return null;
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
      sameAs: row.same_as,
      source: noted ? "noted" : row.source === "added" ? "added" : "photo",
      pointedBy: pointers.get(id) ?? [],
      box: boxOfRow(row),
      boxMissed: row.box_missed && boxOfRow(row) === null,
      quantity: row.quantity,
      changes: row.quantity === null ? [] : changes.data,
    };
  });
}

/** Story 18.23: puts a restored föremål's history back. Never throws: the föremål and its count are back either way, and a failure is only logged. */
async function restoreHistoryIn(db: ThingsDb, thing: ThingSnapshot): Promise<void> {
  if (thing.quantity === null || thing.changes.length === 0) return;
  try {
    // Story 21.3: each change keeps the one who made it (put_thing_changes checks that they are in the household).
    const { error } = await db.rpc("put_thing_changes", {
      item: thing.id,
      changes: thing.changes.map((change) => ({
        kind: change.kind,
        delta: change.delta,
        quantity_after: change.quantity_after,
        cleared: change.cleared,
        created_at: change.created_at,
        ...(change.user_id === undefined ? {} : { user_id: change.user_id }),
      })),
    });
    if (error) console.error("things_history_restore_failed", { reason: error.code });
  } catch {
    console.error("things_history_restore_failed", { reason: "threw" });
  }
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
      source: thing.source,
      ...boxColumnsOf(thing),
      quantity: thing.quantity,
    });
    if (!error) {
      await relinkItemsIn(db, [{ id: thing.id, sameAs: thing.sameAs, pointedBy: thing.pointedBy }]);
      await restoreHistoryIn(db, thing);
      return "restored";
    }
    if (error.code === "23505") return "restored";
    if (error.code === "23503") return "gone";
    throw new ThingsDataError(`restore_failed ${error.code}`);
  });
}

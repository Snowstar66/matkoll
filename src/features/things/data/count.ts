import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { changeRowSchema, countSnapshotSchema, newestFirst, toChange, type Changed, type CountSnapshot, type ThingChange, type ThingCount } from "../domain/thing-count";
import { guarded, ThingsDataError, type ThingsDb } from "./client";

// Ta och fyll på (Story 18.23): the count of a föremål and its history,
// through the user's session client, so RLS limits every read and write to the
// user's own rows (AD-4). Every change goes through a Postgres function that
// changes the count and logs it in one transaction (change_thing_quantity,
// undo_thing_change, set_thing_quantity, stop_thing_count,
// restore_thing_count). Errors carry only a fixed reason and the Postgres code.

const goneCode = "MK440";
const notCountedCode = "MK442";
const countedAgainCode = "MK443";
const notLatestCode = "MK444";

const changedSchema = z.array(z.object({ change_id: z.uuid(), quantity_now: z.number().int() })).length(1);


/**
 * Ta (delta < 0) or Fyll på (delta > 0). `gone` when the föremål is not the
 * user's or is gone, `not_counted` when it has no count. Throws
 * ThingsDataError `change_failed <code>` or `invalid_row`.
 */
export async function changeQuantityIn(db: ThingsDb, itemId: string, delta: number): Promise<Changed | "gone" | "not_counted"> {
  return guarded("change", async () => {
    const { data, error } = await db.rpc("change_thing_quantity", { item: itemId, delta });
    if (error) {
      if (error.code === goneCode) return "gone";
      if (error.code === notCountedCode) return "not_counted";
      throw new ThingsDataError(`change_failed ${error.code}`);
    }
    const parsed = changedSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return { changeId: parsed.data[0].change_id, quantity: parsed.data[0].quantity_now };
  });
}

/**
 * Ångra on a take or refill: the new count, `gone` when the change is gone (a new card cleared it), or `not_latest`
 * when a newer change of the föremål came after it. Throws ThingsDataError `undo_failed <code>`.
 */
export async function undoChangeIn(db: ThingsDb, changeId: string): Promise<number | "gone" | "not_latest"> {
  return guarded("undo", async () => {
    const { data, error } = await db.rpc("undo_thing_change", { change: changeId });
    if (error) {
      if (error.code === goneCode) return "gone";
      if (error.code === notLatestCode) return "not_latest";
      throw new ThingsDataError(`undo_failed ${error.code}`);
    }
    if (typeof data !== "number") throw new ThingsDataError("invalid_row");
    return data;
  });
}

/** Räkna / Rätta antalet. `gone` when the föremål is not the user's. Throws ThingsDataError `set_failed <code>` or `invalid_row`. */
export async function setQuantityIn(db: ThingsDb, itemId: string, quantity: number): Promise<Changed | "gone"> {
  return guarded("set", async () => {
    const { data, error } = await db.rpc("set_thing_quantity", { item: itemId, amount: quantity });
    if (error) {
      if (error.code === goneCode) return "gone";
      throw new ThingsDataError(`set_failed ${error.code}`);
    }
    const parsed = changedSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return { changeId: parsed.data[0].change_id, quantity: parsed.data[0].quantity_now };
  });
}

/**
 * Sluta räkna: the count and its history go; what was there comes back for Ångra. `gone` when not the user's,
 * `not_counted` when it was not counted (already stopped). Throws ThingsDataError `stop_failed <code>` or `invalid_row`.
 */
export async function stopCountIn(db: ThingsDb, itemId: string): Promise<CountSnapshot | "gone" | "not_counted"> {
  return guarded("stop", async () => {
    const { data, error } = await db.rpc("stop_thing_count", { item: itemId });
    if (error) {
      if (error.code === goneCode) return "gone";
      if (error.code === notCountedCode) return "not_counted";
      throw new ThingsDataError(`stop_failed ${error.code}`);
    }
    const parsed = countSnapshotSchema.safeParse(data);
    if (!parsed.success) throw new ThingsDataError("invalid_row");
    return parsed.data;
  });
}

/** Ångra on Sluta räkna. `gone` when the föremål is gone, `counted` when it has been counted again since. Throws ThingsDataError `restore_failed <code>`. */
export async function restoreCountIn(db: ThingsDb, snapshot: CountSnapshot): Promise<"restored" | "gone" | "counted"> {
  return guarded("restore", async () => {
    const { error } = await db.rpc("restore_thing_count", {
      item: snapshot.item,
      amount: snapshot.quantity,
      changes: snapshot.changes as unknown as Json,
    });
    if (!error) return "restored";
    if (error.code === goneCode) return "gone";
    if (error.code === countedAgainCode) return "counted";
    throw new ThingsDataError(`restore_failed ${error.code}`);
  });
}

/** The history rows a count keeps at most. */
const maxChanges = 50;

/** The histories of `itemIds` (each newest first, at most 50). Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadChangesIn(db: ThingsDb, itemIds: readonly string[]): Promise<Map<string, ThingChange[]>> {
  const histories = new Map<string, ThingChange[]>();
  if (itemIds.length === 0) return histories;
  return guarded("query", async () => {
    const { data, error } = await db
      .from("thing_change")
      .select("id, item_id, kind, delta, quantity_after, cleared, created_at")
      .in("item_id", [...new Set(itemIds)])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(maxChanges * itemIds.length);
    if (error) throw new ThingsDataError(`query_failed ${error.code}`);
    for (const row of data) {
      const parsed = changeRowSchema.safeParse(row);
      if (!parsed.success) throw new ThingsDataError("invalid_row");
      histories.set(parsed.data.item_id, [...(histories.get(parsed.data.item_id) ?? []), toChange(parsed.data)]);
    }
    for (const [id, changes] of histories) histories.set(id, newestFirst(changes));
    return histories;
  });
}


const countRowSchema = z.object({ id: z.uuid(), same_as: z.uuid().nullable(), quantity: z.number().int().nullable() });

/** The count of `itemId`, or `null` when it is gone or not the user's. Throws ThingsDataError `query_failed <code>` or `invalid_row`. */
export async function loadCountIn(db: ThingsDb, itemId: string): Promise<ThingCount | null> {
  return guarded("query", async () => {
    const first = await db.from("thing_item").select("id, same_as, quantity").eq("id", itemId).maybeSingle();
    if (first.error) throw new ThingsDataError(`query_failed ${first.error.code}`);
    if (!first.data) return null;
    let row = countRowSchema.safeParse(first.data);
    if (!row.success) throw new ThingsDataError("invalid_row");
    if (row.data.same_as) {
      // Merged into another föremål (Story 18.6): that one holds the count.
      const kept = await db.from("thing_item").select("id, same_as, quantity").eq("id", row.data.same_as).maybeSingle();
      if (kept.error) throw new ThingsDataError(`query_failed ${kept.error.code}`);
      if (!kept.data) return null;
      row = countRowSchema.safeParse(kept.data);
      if (!row.success) throw new ThingsDataError("invalid_row");
    }
    const changes = row.data.quantity === null ? [] : ((await loadChangesIn(db, [row.data.id])).get(row.data.id) ?? []);
    return { itemId: row.data.id, quantity: row.data.quantity, changes };
  });
}

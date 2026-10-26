import "server-only";
import { z } from "zod";
import { pantryRowSchema, type PantryRow } from "../domain/pantry-item-form";
import { PantryDataError, type PantryDb } from "./client";

const idSchema = z.uuid();

type DbRow = { id: string; ingredient_id: string; location: string; amount: number | null; unit: string | null };

/** A row from the database as the domain's PantryRow; the check lists equal the domain's. */
function toPantryRow(row: DbRow): PantryRow {
  const parsed = pantryRowSchema.safeParse({
    id: row.id,
    ingredientId: row.ingredient_id,
    location: row.location,
    amount: row.amount === null ? null : Number(row.amount),
    unit: row.unit,
  });
  if (!parsed.success) throw new PantryDataError("invalid_row");
  return parsed.data;
}

/**
 * What removePantryItemIn deleted: the row as it was, for "Ångra", or null
 * when the deleted row could not be read back as a pantry row (it is gone
 * all the same, but cannot be put back).
 */
export type RemovedPantryRow = { row: PantryRow | null };

/**
 * removePantryItem (AD-19) for the signed-in user: deletes the row for good
 * (AD-20) and returns it as it was, for "Ångra". The delete names the user as
 * well as relying on RLS, so another user's row is never touched. Returns
 * null when the user has no row with the id (another user's, or gone already).
 * The delete has happened before the row is read back, so a row that does
 * not parse never throws: it gives `{ row: null }`.
 *
 * Throws PantryDataError: `invalid_id` before anything is deleted, or
 * `remove_failed <code>` when Postgres refuses.
 */
export async function removePantryItemIn(db: PantryDb, userId: string, id: string): Promise<RemovedPantryRow | null> {
  if (!idSchema.safeParse(id).success) throw new PantryDataError("invalid_id");
  const { data, error } = await db
    .from("pantry_item")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, ingredient_id, location, amount, unit");
  if (error) throw new PantryDataError(`remove_failed ${error.code}`);
  const [row] = data;
  if (!row) return null;
  try {
    return { row: toPantryRow(row) };
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    return { row: null };
  }
}

/**
 * restorePantryItem (AD-19, AD-20) for the signed-in user: puts a removed
 * row back with the same id, amount, unit and location (restore_pantry_item).
 * Refused, with nothing changed, when the location has the item again (a row
 * with the same key, or one of the other kind: unlimited or amounts) or a
 * row has the id.
 *
 * Throws PantryDataError: `invalid_row` before anything is written, or
 * `restore_failed <code>` when Postgres refuses (23505 for the cases above).
 */
export async function restorePantryItemIn(db: PantryDb, row: PantryRow): Promise<PantryRow> {
  const parsed = pantryRowSchema.safeParse(row);
  if (!parsed.success) throw new PantryDataError("invalid_row");
  const { id, ingredientId, location, amount, unit } = parsed.data;
  const { data, error } = await db.rpc("restore_pantry_item", {
    item: { id, ingredient_id: ingredientId, location, amount, unit },
  });
  if (error) throw new PantryDataError(`restore_failed ${error.code}`);
  return toPantryRow(data);
}

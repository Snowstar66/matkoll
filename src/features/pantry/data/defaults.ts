import "server-only";
import { PantryDataError, type PantryDb } from "./client";

/**
 * Adds the pantry's start data for the signed-in user through the Postgres
 * function ensure_pantry_defaults() (AD-21, AD-24): Hemma as the selected
 * place, only when the user has no places. Idempotent. Throws
 * PantryDataError when the call fails.
 */
export async function insertPantryDefaults(db: PantryDb): Promise<void> {
  const { error } = await db.rpc("ensure_pantry_defaults");
  if (error) throw new PantryDataError(`ensure_pantry_defaults ${error.code}`);
}

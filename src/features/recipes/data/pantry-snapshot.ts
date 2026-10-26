import "server-only";
import type { PantrySnapshot } from "@/features/pantry";
import { getPantrySnapshot, PantryDataError } from "@/features/pantry/server";

/**
 * The signed-in user's pantry for the recipes' status, or `null` when it
 * cannot be read (logged as `pantry_unavailable`): the status never takes the
 * recipes down, they are shown without it. Other errors are bugs and are
 * thrown.
 */
export async function pantrySnapshotOrNull(): Promise<PantrySnapshot | null> {
  try {
    return await getPantrySnapshot();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_unavailable", { reason: error.detail });
    return null;
  }
}

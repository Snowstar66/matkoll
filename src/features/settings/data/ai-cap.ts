import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";
import {
  type AiCapStatus,
  capStatusFromRows,
  type HouseholdCost,
  householdCostsFromRows,
} from "../domain/ai-cap";

// The daily AI cap (supabase/migrations/…_ai_cap.sql). The table is closed to every client; the
// caller's own household is read through ai_cap_status(), and the owner works through functions
// that check is_app_owner() (42501 for anyone else).

/** The database's refusal of a caller who is not the app's owner. */
const notOwnerCode = "42501";

/** Today's standing of the signed-in user's household (spend 0 without a household), or `null` when the database gives no row. Throws SettingsDataError. */
export async function loadAiCapStatusIn(db: SettingsDb): Promise<AiCapStatus | null> {
  const { data, error } = await db.rpc("ai_cap_status");
  if (error) throw new SettingsDataError(`load_ai_cap_status_failed ${error.code}`);
  return capStatusFromRows(data ?? []);
}

/** Whether the signed-in user's household is exempt from the cap, without summing its usage (ai_cap_exempt). Throws SettingsDataError. */
export async function loadAiCapExemptIn(db: SettingsDb): Promise<boolean> {
  const { data, error } = await db.rpc("ai_cap_exempt");
  if (error) throw new SettingsDataError(`load_ai_cap_exempt_failed ${error.code}`);
  return data === true;
}

/** Every household's estimated cost today and this month, and the cap, or `null` for anyone but the owner. Throws SettingsDataError. */
export async function loadHouseholdCostsIn(db: SettingsDb): Promise<{ capSek: number; households: HouseholdCost[] } | null> {
  const { data, error } = await db.rpc("ai_cap_households");
  if (error) {
    if (error.code === notOwnerCode) return null;
    throw new SettingsDataError(`load_household_costs_failed ${error.code}`);
  }
  return householdCostsFromRows(data ?? []);
}

/** Sets the daily cap in kronor (the owner only). Returns false for anyone else. Throws SettingsDataError. */
export async function saveAiCapIn(db: SettingsDb, capSek: number): Promise<boolean> {
  const { error } = await db.rpc("set_ai_cap", { new_cap: capSek });
  if (error) {
    if (error.code === notOwnerCode) return false;
    throw new SettingsDataError(`save_ai_cap_failed ${error.code}`);
  }
  return true;
}

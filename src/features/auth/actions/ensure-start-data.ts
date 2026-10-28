import "server-only";
import { ensurePantryDefaults, PantryDataError } from "@/features/pantry/server";
import { ensureUserDefaults, SettingsDataError } from "@/features/settings/server";

/**
 * After a sign-in, with the link or the code, the user's start data is ensured
 * (AD-21): the settings' first, then the pantry's (Hemma as the selected
 * place, AD-24), each on its own. A failure in either is logged but stops
 * neither the other nor the sign-in, and the next sign-in tries again.
 */
export async function ensureStartData(): Promise<void> {
  try {
    await ensureUserDefaults();
  } catch (error) {
    // Only the fixed reason, never user data.
    console.error("settings_defaults_failed", { reason: error instanceof SettingsDataError ? error.detail : "unknown" });
  }
  try {
    await ensurePantryDefaults();
  } catch (error) {
    // Only the fixed reason, never user data.
    console.error("pantry_defaults_failed", { reason: error instanceof PantryDataError ? error.detail : "unknown" });
  }
}

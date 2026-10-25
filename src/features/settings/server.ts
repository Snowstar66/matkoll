import "server-only";
import { createClient } from "@/lib/supabase/server";
import { insertUserDefaults } from "./data/defaults";
import { loadActiveRecipeDomains } from "./data/queries";

// Server-only entry (AD-1). Both functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. Managing the sites in
// Inställningar arrives in Story 1.12.

/** What the functions below throw when Supabase fails; never user data. */
export { SettingsDataError } from "./data/client";

/** The active approved recipe sites of the signed-in user (bare domain names, AD-11). */
export async function getActiveRecipeDomains(): Promise<string[]> {
  return loadActiveRecipeDomains(await createClient());
}

/**
 * Start data for the signed-in user (AD-21). Called by auth/confirm after a
 * successful sign-in; idempotent, so every sign-in may call it.
 */
export async function ensureUserDefaults(): Promise<void> {
  await insertUserDefaults(await createClient());
}

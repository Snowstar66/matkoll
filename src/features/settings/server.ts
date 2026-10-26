import "server-only";
import { createClient } from "@/lib/supabase/server";
import { insertUserDefaults } from "./data/defaults";
import { loadActiveRecipeDomains } from "./data/queries";
import { compareDomains } from "./domain/domain-name";

// Server-only entry (AD-1). The functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. Writes go through the
// actions in ./actions (Inställningar, Story 1.12).

/** What the functions below throw when Supabase fails; never user data. */
export { SettingsDataError } from "./data/client";

/**
 * The active approved recipe sites of the signed-in user (bare domain names,
 * AD-11), for the import flow. Read on every request, so a change in
 * Inställningar applies at once.
 */
export async function getActiveRecipeDomains(): Promise<string[]> {
  return loadActiveRecipeDomains(await createClient());
}

/**
 * The signed-in user's active recipe sites in alphabetical order, for the
 * list in Inställningar. Sorted here with `compareDomains`, the same order
 * the list keeps in the browser, not by the database's collation. For pages,
 * after requireUserOrRedirect, inside <Suspense> (AD-18). Throws
 * SettingsDataError.
 */
export async function listRecipeSites(): Promise<string[]> {
  return (await loadActiveRecipeDomains(await createClient())).sort(compareDomains);
}

/**
 * Start data for the signed-in user (AD-21). Called by auth/confirm after a
 * successful sign-in; idempotent, so every sign-in may call it. Never turns
 * on a site Pontus has turned off.
 */
export async function ensureUserDefaults(): Promise<void> {
  await insertUserDefaults(await createClient());
}

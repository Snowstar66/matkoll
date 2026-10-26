import "server-only";
import { ensurePantryDefaults, PantryDataError } from "@/features/pantry/server";
import { ensureUserDefaults, SettingsDataError } from "@/features/settings/server";
import { env } from "@/server/env";
import { type EmailLinkResult, verifyEmailLink } from "../data/auth";
import { isAllowedEmail } from "../domain/allowed-email";

/**
 * Signs in with the token hash from the magic link (AD-3). A valid link for an
 * address outside ALLOWED_EMAILS gives no session. After a successful sign-in
 * the user's start data is ensured (AD-21): the settings' first, then the
 * pantry's (Hemma as the selected place, AD-24), each on its own. A failure
 * in either is logged but stops neither the other nor the sign-in, and the
 * next sign-in tries again.
 */
export async function confirmEmailLink(tokenHash: string): Promise<EmailLinkResult> {
  const result = await verifyEmailLink(tokenHash, (email) => isAllowedEmail(email, env.ALLOWED_EMAILS ?? []));
  if (result === "signed_in") {
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
  return result;
}

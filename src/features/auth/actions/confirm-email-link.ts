import "server-only";
import { env } from "@/server/env";
import { type EmailLinkResult, verifyEmailLink } from "../data/auth";
import { isAllowedEmail } from "../domain/allowed-email";

/**
 * Signs in with the token hash from the magic link (AD-3). A valid link for an
 * address outside ALLOWED_EMAILS gives no session. Story 1.8 adds
 * ensure_user_defaults() here.
 */
export async function confirmEmailLink(tokenHash: string): Promise<EmailLinkResult> {
  return verifyEmailLink(tokenHash, (email) => isAllowedEmail(email, env.ALLOWED_EMAILS ?? []));
}

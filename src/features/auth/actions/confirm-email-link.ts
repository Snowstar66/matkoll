import "server-only";
import { env } from "@/server/env";
import { type EmailLinkResult, verifyEmailLink } from "../data/auth";
import { isAllowedEmail } from "../domain/allowed-email";
import { ensureStartData } from "./ensure-start-data";

/**
 * Signs in with the token hash from the magic link (AD-3). A valid link for an
 * address outside ALLOWED_EMAILS gives no session. After a successful sign-in
 * the user's start data is ensured (AD-21, see ensureStartData).
 */
export async function confirmEmailLink(tokenHash: string): Promise<EmailLinkResult> {
  const result = await verifyEmailLink(tokenHash, (email) => isAllowedEmail(email, env.ALLOWED_EMAILS ?? []));
  if (result === "signed_in") await ensureStartData();
  return result;
}

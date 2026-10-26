"use server";

import { fail, ok, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { loginFieldErrors, loginSchema } from "../domain/login-schema";
import { safeNextPath } from "../domain/safe-next-path";
import { requestMagicLink } from "../data/auth";

export type SendMagicLinkState = Result<null> | null;

/**
 * Sends a magic link to an allowed address (AD-3). The answer is the same
 * whether or not the address is allowed or Supabase failed, so the allowlist
 * is never revealed.
 */
export async function sendMagicLink(
  _previous: SendMagicLinkState,
  formData: FormData,
): Promise<SendMagicLinkState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email") ?? undefined,
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation", loginFieldErrors(parsed.error));
  }

  const { email, next } = parsed.data;
  if (isAllowedEmail(email, env.ALLOWED_EMAILS ?? [])) {
    // SITE_URL, not request headers: it must match Supabase's redirect allowlist.
    const confirmUrl = new URL("/auth/confirm", env.SITE_URL);
    confirmUrl.searchParams.set("next", safeNextPath(next));
    const sent = await requestMagicLink(normalizeEmail(email), confirmUrl.toString());
    if (!sent.ok) console.error("auth_magic_link_failed", sent.code);
  }
  return ok();
}

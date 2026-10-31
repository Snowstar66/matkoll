"use server";

import { fail, ok, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { requestPasswordReset as requestResetMail } from "../data/auth";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { loginFieldErrors, loginSchema } from "../domain/login-schema";
import { safeNextPath } from "../domain/safe-next-path";

/**
 * "Glömt lösenord" (Story 17.2): mails a link to /auth/confirm where a new
 * password is chosen. The answer is the same whether or not the address is
 * allowed, has an account, or Supabase failed, so neither is revealed (Supabase
 * itself sends nothing for an address without an account).
 */
export async function requestPasswordReset(input: { email: string; next?: string }): Promise<Result<null>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail("validation", loginFieldErrors(parsed.error));

  const { email, next } = parsed.data;
  if (isAllowedEmail(email, env.ALLOWED_EMAILS ?? [])) {
    // SITE_URL, not request headers: it must match Supabase's redirect allowlist.
    const confirmUrl = new URL("/auth/confirm", env.SITE_URL);
    confirmUrl.searchParams.set("next", safeNextPath(next));
    const sent = await requestResetMail(normalizeEmail(email), confirmUrl.toString());
    if (!sent.ok) console.error("auth_password_reset_failed", sent.code);
  }
  return ok();
}

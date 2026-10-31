"use server";

import { headers } from "next/headers";
import { clientIpFrom, sha256Hex } from "@/lib/client-ip";
import { fail, ok, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { requestPasswordReset as requestResetMail } from "../data/auth";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { loginFieldErrors, loginSchema } from "../domain/login-schema";
import { safeNextPath } from "../domain/safe-next-path";
import { resetAttempts } from "./password-attempt-limit";

/**
 * "Välj lösenord" (Story 17.2): mails a link to /auth/confirm where a password
 * is chosen, for a first sign-in and for a forgotten password alike. The answer
 * is the same whether or not the address is allowed, has an account, or
 * Supabase failed, so neither is revealed (Supabase itself sends nothing for an
 * address without an account). Every request counts towards the app's limit, 5
 * per address and client IP in 15 minutes, whatever the address; without an IP
 * the count is per address only, so one missing header cannot lock others out.
 */
export async function requestPasswordReset(input: { email: string; next?: string }): Promise<Result<null>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail("validation", loginFieldErrors(parsed.error));

  const { email, next } = parsed.data;
  const ip = clientIpFrom(await headers());
  const key = ip ? `${sha256Hex(normalizeEmail(email))}|${ip}` : sha256Hex(normalizeEmail(email));
  if (resetAttempts.isBlocked(key)) return fail("auth_password_rate_limited");
  resetAttempts.recordFailure(key);
  if (isAllowedEmail(email, env.ALLOWED_EMAILS ?? [])) {
    // SITE_URL, not request headers: it must match Supabase's redirect allowlist.
    const confirmUrl = new URL("/auth/confirm", env.SITE_URL);
    confirmUrl.searchParams.set("next", safeNextPath(next));
    const sent = await requestResetMail(normalizeEmail(email), confirmUrl.toString());
    if (!sent.ok) console.error("auth_password_reset_failed", sent.code);
  }
  return ok();
}

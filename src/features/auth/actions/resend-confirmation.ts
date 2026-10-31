"use server";

import { headers } from "next/headers";
import { clientIpFrom, sha256Hex } from "@/lib/client-ip";
import { fail, ok, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { resendConfirmation as resendConfirmationMail } from "../data/auth";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { loginFieldErrors, loginSchema } from "../domain/login-schema";
import { safeNextPath } from "../domain/safe-next-path";
import { resendAttempts } from "./password-attempt-limit";

/**
 * "Skicka mejlet igen" after a sign-in that said the e-mail is not confirmed
 * (Story 17.2). The answer is the same whether or not the address is allowed,
 * has an account or Supabase failed (Supabase sends nothing for an address that
 * needs no confirmation); only the app's own limit answers differently, and it
 * counts every request, so it says nothing about the address.
 */
export async function resendConfirmation(input: { email: string; next?: string }): Promise<Result<null>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail("validation", loginFieldErrors(parsed.error));

  const email = normalizeEmail(parsed.data.email);
  const key = `${sha256Hex(email)}|${clientIpFrom(await headers()) ?? "none"}`;
  if (resendAttempts.isBlocked(key)) return fail("auth_password_rate_limited");
  resendAttempts.recordFailure(key);

  if (isAllowedEmail(email, env.ALLOWED_EMAILS ?? [])) {
    const confirmUrl = new URL("/auth/confirm", env.SITE_URL);
    confirmUrl.searchParams.set("next", safeNextPath(parsed.data.next));
    const sent = await resendConfirmationMail(email, confirmUrl.toString());
    if (!sent.ok) console.error("auth_confirmation_resend_failed", sent.code);
  }
  return ok();
}

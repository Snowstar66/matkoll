"use server";

import { redirect } from "next/navigation";
import { fail, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { verifyEmailCode as verifyCodeWithSupabase } from "../data/auth";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { type EmailCodeInput, emailCodeSchema } from "../domain/login-schema";
import { safeNextPath } from "../domain/safe-next-path";
import { ensureStartData } from "./ensure-start-data";

/**
 * Signs in with the six-digit code from the same e-mail as the link (FR-1,
 * AD-3, AD-27), for the app on the iPhone home screen, which does not share
 * cookies with Safari where the link opens. Supabase checks the code (one hour,
 * `otp_expiry`, and its own rate limits); the address is then checked against
 * ALLOWED_EMAILS as for the link. A code that is not six digits, a wrong,
 * expired or used code and an address outside the list all give
 * `auth_code_invalid`, so the allowlist is never revealed. On success Pontus
 * goes to a safe `next`, or /recept. Neither the code nor the address is logged.
 */
export async function verifyEmailCode(input: EmailCodeInput): Promise<Result<never>> {
  const parsed = emailCodeSchema.safeParse(input);
  if (!parsed.success) return fail("auth_code_invalid");

  const { email, code, next } = parsed.data;
  const outcome = await verifyCodeWithSupabase(normalizeEmail(email), code, (address) =>
    isAllowedEmail(address, env.ALLOWED_EMAILS ?? []),
  );
  if (outcome.result === "invalid") {
    // Supabase's reason (e.g. otp_expired, over_request_rate_limit) only.
    console.info("auth_code_refused", outcome.code);
    return fail("auth_code_invalid");
  }
  if (outcome.result === "not_allowed") return fail("auth_code_invalid");

  await ensureStartData();
  redirect(safeNextPath(next));
}

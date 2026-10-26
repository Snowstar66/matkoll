"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpFrom, ipLogTag, sha256Hex } from "@/lib/client-ip";
import { fail, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { verifyEmailCode as verifyCodeWithSupabase } from "../data/auth";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { type EmailCodeInput, emailCodeSchema } from "../domain/login-schema";
import { safeNextPath } from "../domain/safe-next-path";
import { codeAttempts } from "./code-attempt-limit";
import { ensureStartData } from "./ensure-start-data";

/**
 * Signs in with the six-digit code from the same e-mail as the link (FR-1,
 * AD-3, AD-27), for the app on the iPhone home screen, which does not share
 * cookies with Safari where the link opens. In order:
 *
 * 1. The app's own limit: after 5 wrong codes for the address and the
 *    browser's IP within 15 minutes, `auth_code_rate_limited` without asking
 *    Supabase (codeAttempts, per server instance).
 * 2. The code must be six digits (after normalising), and the address must be
 *    in ALLOWED_EMAILS; otherwise `auth_code_invalid`, without asking Supabase.
 * 3. Supabase checks the code (one hour, `otp_expiry`) with the browser's IP
 *    as `Sb-Forwarded-For` for its own per-IP limit, which gives
 *    `auth_code_rate_limited`. A wrong, expired or used code gives
 *    `auth_code_invalid`.
 * 4. The address is checked against ALLOWED_EMAILS again, as for the link;
 *    a refused session is signed out at once.
 *
 * Every `auth_code_invalid` counts towards the limit, whatever the reason, so
 * the limit says nothing about the allowlist. On success Pontus goes to a safe
 * `next`, or /recept. Neither the code nor the address is logged; the IP only
 * as 8 characters of its hash.
 */
export async function verifyEmailCode(input: EmailCodeInput): Promise<Result<never>> {
  const ip = clientIpFrom(await headers());
  const ipTag = ipLogTag(ip);
  const rawEmail = typeof input?.email === "string" ? normalizeEmail(input.email) : "";
  const attemptKey = `${sha256Hex(rawEmail)}|${ip ?? "none"}`;

  if (codeAttempts.isBlocked(attemptKey)) {
    console.warn("auth_code_rate_limited", { by: "app", ip: ipTag });
    return fail("auth_code_rate_limited");
  }

  function refuse(): Result<never> {
    codeAttempts.recordFailure(attemptKey);
    return fail("auth_code_invalid");
  }

  const parsed = emailCodeSchema.safeParse(input);
  if (!parsed.success) return refuse();

  const { code, next } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const allowed = (address: string | null | undefined) => isAllowedEmail(address, env.ALLOWED_EMAILS ?? []);
  if (!allowed(email)) {
    console.warn("auth_code_not_allowed", { ip: ipTag });
    return refuse();
  }

  const outcome = await verifyCodeWithSupabase(email, code, allowed, { forwardedFor: ip });
  if (outcome.result === "rate_limited") {
    console.warn("auth_code_rate_limited", { by: "supabase", ip: ipTag });
    return fail("auth_code_rate_limited");
  }
  if (outcome.result === "invalid") {
    // Supabase's reason (e.g. otp_expired) only.
    console.info("auth_code_refused", outcome.code);
    return refuse();
  }
  if (outcome.result === "not_allowed") {
    console.warn("auth_code_not_allowed", { ip: ipTag, after: "verify" });
    return refuse();
  }

  codeAttempts.reset(attemptKey);
  await ensureStartData();
  redirect(safeNextPath(next));
}

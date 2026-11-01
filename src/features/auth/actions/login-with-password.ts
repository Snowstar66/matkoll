"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpFrom, ipLogTag, sha256Hex } from "@/lib/client-ip";
import { fail, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { dropCurrentSession, signInWithPassword } from "../data/auth";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { type PasswordLoginInput, passwordLoginSchema } from "../domain/login-schema";
import { safeNextPath } from "../domain/safe-next-path";
import { ensureStartData } from "./ensure-start-data";
import { passwordAttempts } from "./password-attempt-limit";

/**
 * Signs in with e-mail and password (Story 17.2, AD-3). In order:
 *
 * 1. The app's limit: after 5 failures for the address and the browser's IP
 *    within 15 minutes, `auth_password_rate_limited` without asking Supabase.
 * 2. The input must be valid; otherwise `auth_password_invalid` without
 *    asking Supabase.
 * 3. Supabase checks the password. A wrong password and an unknown address both
 *    give `auth_password_invalid`, so a sign-in never says which addresses
 *    have an account; Supabase's own limit gives `auth_password_rate_limited`.
 * 4. The address must be in ALLOWED_EMAILS, or (Story 21.2b) the person a
 *    member of a household with someone on that list; otherwise the session
 *    is signed out at once and the answer is `auth_password_invalid`.
 *
 * Every `auth_password_invalid` counts towards the limit, whatever the reason.
 * The session lasts until sign-out (see sessionMaxAgeSeconds). Neither the
 * password nor the address is logged; the IP only as 8 characters of its hash.
 */
export async function loginWithPassword(input: PasswordLoginInput): Promise<Result<never>> {
  const ip = clientIpFrom(await headers());
  const ipTag = ipLogTag(ip);
  const rawEmail = typeof input?.email === "string" ? normalizeEmail(input.email) : "";
  // Without an IP the count is per address only.
  const attemptKey = ip ? `${sha256Hex(rawEmail)}|${ip}` : sha256Hex(rawEmail);

  if (passwordAttempts.isBlocked(attemptKey)) {
    console.warn("auth_password_rate_limited", { by: "app", ip: ipTag });
    return fail("auth_password_rate_limited");
  }

  function refuse(): Result<never> {
    passwordAttempts.recordFailure(attemptKey);
    return fail("auth_password_invalid");
  }

  const parsed = passwordLoginSchema.safeParse(input);
  if (!parsed.success) return refuse();

  const { password, next } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const allowedList = env.ALLOWED_EMAILS ?? [];
  const allowed = (address: string | null | undefined) => isAllowedEmail(address, allowedList);

  // Story 21.2b: an address outside the list may still be an invited member, which only the session can tell.
  const outcome = await signInWithPassword(email, password, { forwardedFor: ip, household: allowed(email) ? undefined : allowedList });
  if (outcome.result === "rate_limited") {
    console.warn("auth_password_rate_limited", { by: "supabase", ip: ipTag });
    return fail("auth_password_rate_limited");
  }
  if (outcome.result !== "signed_in") {
    console.info("auth_password_refused", outcome.code);
    return refuse();
  }
  if (!allowed(outcome.email) && !outcome.viaHousehold) {
    await dropCurrentSession("auth_password_signout_failed");
    console.warn("auth_password_not_allowed", { ip: ipTag, after: "sign-in" });
    return refuse();
  }

  passwordAttempts.reset(attemptKey);
  await ensureStartData();
  redirect(safeNextPath(next));
}

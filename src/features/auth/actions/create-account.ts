"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpFrom, ipLogTag } from "@/lib/client-ip";
import { fail, ok, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { dropCurrentSession, signUpWithPassword } from "../data/auth";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { loginFieldErrors, type SignUpInput, signUpSchema } from "../domain/login-schema";
import { safeNextPath } from "../domain/safe-next-path";
import { ensureStartData } from "./ensure-start-data";

/**
 * "Skapa konto" (Story 17.2, AD-3): the account is created only for an address
 * in ALLOWED_EMAILS, checked here on the server before Supabase is asked; the
 * form's own checks are a convenience. An address outside the list gets
 * `auth_signup_not_allowed` and nothing is created. This is the one place the
 * allowlist shows, as the story asks for a friendly no; sign-in and "Glömt
 * lösenord" never reveal it. An address that already has an account gets
 * `auth_signup_exists`, which only an allowed address can see. The project
 * requires e-mail confirmation, so success is `ok` ("mejlet är skickat") and
 * no session exists until the link in the mail is used at /auth/confirm; a
 * project without confirmation signs in at once and goes to a safe `next`, or
 * /recept.
 */
export async function createAccount(input: SignUpInput): Promise<Result<null>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return fail("validation", loginFieldErrors(parsed.error));

  const { password, next } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const allowed = (address: string | null | undefined) => isAllowedEmail(address, env.ALLOWED_EMAILS ?? []);
  const ip = clientIpFrom(await headers());
  if (!allowed(email)) {
    console.warn("auth_signup_not_allowed", { ip: ipLogTag(ip) });
    return fail("auth_signup_not_allowed");
  }

  // SITE_URL, not request headers: it must match Supabase's redirect allowlist.
  const confirmUrl = new URL("/auth/confirm", env.SITE_URL);
  confirmUrl.searchParams.set("next", safeNextPath(next));
  const outcome = await signUpWithPassword(email, password, confirmUrl.toString(), { forwardedFor: ip });
  if (outcome.result === "confirmation_sent") return ok();
  if (outcome.result === "exists") return fail("auth_signup_exists");
  if (outcome.result === "rate_limited") return fail("auth_password_rate_limited");
  if (outcome.result !== "signed_in") {
    console.error("auth_signup_failed", outcome.code);
    return fail("auth_signup_failed");
  }
  if (!allowed(outcome.email)) {
    await dropCurrentSession("auth_signup_signout_failed");
    console.warn("auth_signup_not_allowed", { ip: ipLogTag(ip), after: "sign-up" });
    return fail("auth_signup_not_allowed");
  }

  await ensureStartData();
  redirect(safeNextPath(next));
}

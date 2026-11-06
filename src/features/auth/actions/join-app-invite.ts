"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { isAppInviteCodeShape } from "@/features/app-invites";
import { normalizeInviteCode } from "@/features/household";
import { clientIpFrom, ipLogTag, sha256Hex } from "@/lib/client-ip";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";
import { dropCurrentSession, signInWithPassword } from "../data/auth";
import { householdLetsIn } from "../data/household-access";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { newPasswordSchema } from "../domain/login-schema";
import { ensureStartData } from "./ensure-start-data";
import { passwordAttempts } from "./password-attempt-limit";

// "Skapa konto" on /inbjudan (Story 21.1). The code in the link is the proof, bound to the
// address the owner typed: the person makes an account with that address and a password
// of their own, no mail is sent (the cloud cannot send any yet). Supabase's Before User
// Created hook (household_signup_hook) lets a sign-up through only with an open invitation
// for that address, and claim_app_invite then uses it up as the new user. Someone who has
// an account signs in here instead, and someone signed in just claims it. A session that
// ends up with no access is signed out again. Neither the code, the address nor the
// password is logged.

const joinSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("session"), code: z.string() }),
  z.object({
    mode: z.enum(["signup", "login"]),
    code: z.string(),
    email: z.string().trim().pipe(z.email({ error: "Ange en giltig e-postadress." })),
    password: z.string().min(1, { error: "Skriv ett lösenord." }),
  }),
]);

type JoinInput = z.input<typeof joinSchema>;

/** Uses `code` up as the signed-in person; the database's refusal of too many wrong codes (MK451) is told apart. */
async function claim(code: string): Promise<Result<null>> {
  const db = await createClient();
  const { data, error } = await db.rpc("claim_app_invite", { code });
  if (error) {
    if (error.code === "MK451") return fail("household_invite_locked");
    console.error("app_invite_claim_failed", { reason: error.code });
    return fail("app_invite_join_failed");
  }
  return data === true ? ok(null) : fail("app_invite_gone");
}

/**
 * Makes the account (`signup`), signs in (`login`) or uses the session there is
 * (`session`), then uses the code up. The page sends the person on to the app.
 */
export async function joinAppInvite(input: JoinInput): Promise<Result<null>> {
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "form");
    return fail("validation", field === "email" || field === "password" ? { [field]: issue?.message ?? "" } : undefined);
  }
  const join = parsed.data;
  if (!isAppInviteCodeShape(join.code)) return fail("app_invite_gone");
  const code = normalizeInviteCode(join.code);
  const allowedList = env.ALLOWED_EMAILS ?? [];

  if (join.mode === "session") {
    const { data } = await (await createClient()).auth.getClaims();
    if (!data?.claims?.sub) return fail("unauthorized");
    return claim(code);
  }

  const email = normalizeEmail(join.email);
  const ip = clientIpFrom(await headers());
  const ipTag = ipLogTag(ip);

  if (join.mode === "login") {
    // The same limit as the login page, so this is no way around it.
    const attemptKey = ip ? `${sha256Hex(email)}|${ip}` : sha256Hex(email);
    if (passwordAttempts.isBlocked(attemptKey)) return fail("auth_password_rate_limited");
    const outcome = await signInWithPassword(email, join.password, { forwardedFor: ip });
    if (outcome.result === "rate_limited") return fail("auth_password_rate_limited");
    if (outcome.result !== "signed_in") {
      passwordAttempts.recordFailure(attemptKey);
      return fail("auth_password_invalid");
    }
    passwordAttempts.reset(attemptKey);
  } else {
    // An address on ALLOWED_EMAILS gets its account from users:sync, never here.
    if (isAllowedEmail(email, allowedList)) return fail("household_account_exists");
    // The same rule as Välj lösenord (Story 17.2): at least 12 characters, at most 72 bytes.
    const chosen = newPasswordSchema.safeParse(join.password);
    if (!chosen.success) return fail("validation", { password: chosen.error.issues[0]?.message ?? "" });
    const db = await createClient({ forwardedFor: ip });
    const { data, error } = await db.auth.signUp({ email, password: join.password, options: { data: { app_invite_code: code } } });
    if (error) {
      const reason = String(error.code ?? error.status ?? "unknown");
      console.warn("app_invite_signup_refused", { reason, ip: ipTag });
      if (error.code === "user_already_exists" || error.code === "email_exists") return fail("household_account_exists");
      if (error.code === "weak_password") return fail("validation", { password: "Välj ett starkare lösenord." });
      if (error.code === "over_request_rate_limit" || error.status === 429) return fail("auth_password_rate_limited");
      // The hook's refusal (403): no open invitation with the code for the address.
      if (error.status === 403 || error.code === "hook_payload_invalid_content_type") return fail("app_invite_gone");
      return fail("app_invite_join_failed");
    }
    // Without a session (e-mail confirmation turned on in the project), there is no way in.
    if (!data.session) {
      console.error("app_invite_signup_no_session");
      return fail("app_invite_join_failed");
    }
  }

  const claimed = await claim(code);
  // Whatever happened, the person keeps a session only when they have access now.
  const db = await createClient();
  if (!isAllowedEmail(email, allowedList) && !(await householdLetsIn(db, allowedList))) {
    await dropCurrentSession("app_invite_signout_failed");
    return claimed.ok ? fail("app_invite_join_failed") : claimed;
  }
  // The new account's own household starts like any account's (Hemma, the settings).
  if (claimed.ok) await ensureStartData();
  return claimed;
}

"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { isInviteCodeShape, normalizeInviteCode } from "@/features/household";
import { clientIpFrom, ipLogTag, sha256Hex } from "@/lib/client-ip";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";
import { dropCurrentSession, signInWithPassword } from "../data/auth";
import { householdLetsIn } from "../data/household-access";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import { newPasswordSchema } from "../domain/login-schema";
import { passwordAttempts } from "./password-attempt-limit";

// "Gå med" on /ga-med (Story 21.2b). The code in the link is the proof: an
// invited person makes an account with an e-mail and a password of their own,
// no mail is sent (the cloud cannot send any yet). Supabase's sign-up is on,
// but its Before User Created hook (household_signup_hook) lets a sign-up
// through only with an open invitation code in the user's metadata, so no
// one can make an account without one. Someone who has an account signs in
// here instead, and someone signed in just joins. In every case the code is
// then used with accept_household_invite, as the person. A session that ends
// up with no access (the code ran out in between) is signed out again. Neither
// the code, the address nor the password is logged.

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

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/** The database's refusals of accept_household_invite (the migration's errcodes). */
const acceptRefusals = {
  MK451: "household_invite_locked",
  MK452: "household_has_data",
} as const;

async function accept(db: SessionClient, code: string): Promise<Result<{ household: string }>> {
  const { data, error } = await db.rpc("accept_household_invite", { code });
  if (error) {
    // Already a member: nothing to do but go in.
    if (error.code === "MK453") return ok({ household: "" });
    const refusal = acceptRefusals[error.code as keyof typeof acceptRefusals];
    if (refusal) return fail(refusal);
    console.error("household_join_failed", { reason: error.code });
    return fail("household_join_failed");
  }
  const row = data?.[0];
  return row ? ok({ household: row.household_name }) : fail("household_invite_gone");
}

/**
 * Joins the household of the invitation `code`: makes the account first
 * (`signup`), signs in (`login`) or uses the session there is (`session`).
 * Answers with the household's name, for "Välkommen till …". The page sends
 * the person on; a refusal leaves no session behind unless the person had
 * access already.
 */
export async function joinHousehold(input: JoinInput): Promise<Result<{ household: string }>> {
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "form");
    return fail("validation", field === "email" || field === "password" ? { [field]: issue?.message ?? "" } : undefined);
  }
  const join = parsed.data;
  if (!isInviteCodeShape(join.code)) return fail("household_invite_gone");
  const code = normalizeInviteCode(join.code);
  const allowedList = env.ALLOWED_EMAILS ?? [];

  if (join.mode === "session") {
    const db = await createClient();
    const { data } = await db.auth.getClaims();
    if (!data?.claims?.sub) return fail("unauthorized");
    return accept(db, code);
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
    // An address on ALLOWED_EMAILS gets its account from users:sync, never here: with no e-mail
    // confirmation, a code holder could otherwise take an address that has no account yet.
    if (isAllowedEmail(email, allowedList)) return fail("household_account_exists");
    // The same rule as Välj lösenord (Story 17.2): at least 12 characters, at most 72 bytes.
    const chosen = newPasswordSchema.safeParse(join.password);
    if (!chosen.success) return fail("validation", { password: chosen.error.issues[0]?.message ?? "" });
    const db = await createClient({ forwardedFor: ip });
    const { data, error } = await db.auth.signUp({ email, password: join.password, options: { data: { invite_code: code } } });
    if (error) {
      const reason = String(error.code ?? error.status ?? "unknown");
      console.warn("household_signup_refused", { reason, ip: ipTag });
      if (error.code === "user_already_exists" || error.code === "email_exists") return fail("household_account_exists");
      if (error.code === "weak_password") return fail("validation", { password: "Välj ett starkare lösenord." });
      if (error.code === "over_request_rate_limit" || error.status === 429) return fail("auth_password_rate_limited");
      // The hook's refusal (403): no open invitation with the code.
      if (error.status === 403 || error.code === "hook_payload_invalid_content_type") return fail("household_invite_gone");
      return fail("household_join_failed");
    }
    // Without a session (e-mail confirmation turned on in the project), there is no way in.
    if (!data.session) {
      console.error("household_signup_no_session");
      return fail("household_join_failed");
    }
  }

  const db = await createClient();
  const joined = await accept(db, code);
  // Whatever happened, the person keeps a session only when they have access now.
  if (!isAllowedEmail(email, allowedList) && !(await householdLetsIn(db, allowedList))) {
    await dropCurrentSession("household_join_signout_failed");
    return joined.ok ? fail("household_join_failed") : joined;
  }
  return joined;
}

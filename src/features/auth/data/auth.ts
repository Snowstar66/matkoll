import "server-only";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createClient, removeSessionCookies } from "@/lib/supabase/server";
import { householdLetsIn } from "./household-access";

/** Outcome of a Supabase call; `code` is Supabase's error code or HTTP status, never user data. */
export type SupabaseOutcome = { ok: true } | { ok: false; code: string };

/**
 * Asks Supabase to e-mail a magic link. Never creates a user: sign-up is off and
 * users come only from `pnpm users:sync` (AD-3).
 */
export async function requestMagicLink(email: string, redirectTo: string): Promise<SupabaseOutcome> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  return error ? { ok: false, code: String(error.code ?? error.status ?? "unknown") } : { ok: true };
}

/** Outcome of the password calls; `code` is Supabase's error code, never user data. */
export type PasswordOutcome =
  | { result: "signed_in"; email: string | undefined; viaHousehold: boolean }
  | { result: "invalid" | "rate_limited" | "failed"; code: string };

function passwordFailure(error: { code?: string; status?: number }): PasswordOutcome {
  const code = errorCode(error);
  if (isRateLimit(error)) return { result: "rate_limited", code };
  if (code === "invalid_credentials") return { result: "invalid", code };
  return { result: "failed", code };
}

/**
 * Signs in with e-mail and password, which sets the session cookies. With
 * `household` (ALLOWED_EMAILS), `viaHousehold` says whether the person is let
 * in through their household (Story 21.2b), asked with the new session.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  { forwardedFor, household }: { forwardedFor?: string | null; household?: readonly string[] } = {},
): Promise<PasswordOutcome> {
  const supabase = await createClient({ forwardedFor });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return passwordFailure(error);
  const viaHousehold = household ? await householdLetsIn(supabase, household) : false;
  return { result: "signed_in", email: data.user?.email, viaHousehold };
}

/** Asks Supabase to e-mail a password-reset link; the link goes to `redirectTo` with a token_hash. */
export async function requestPasswordReset(email: string, redirectTo: string): Promise<SupabaseOutcome> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  return error ? { ok: false, code: errorCode(error) } : { ok: true };
}

export type PasswordResetResult = "done" | "invalid" | "not_allowed" | "failed";

/**
 * Uses the reset link's token and sets the new password in one step, so the
 * token is spent only when the person has chosen a password. An address that
 * `isAllowed` rejects is signed out at once, as with the other sign-ins.
 */
export async function resetPasswordWithToken(
  tokenHash: string,
  password: string,
  isAllowed: (email: string | undefined) => boolean,
): Promise<PasswordResetResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error) return "invalid";
  if (!isAllowed(data.user?.email)) {
    await dropRefusedSession(supabase, "auth_reset_signout_failed");
    return "not_allowed";
  }
  const updated = await supabase.auth.updateUser({ password });
  if (updated.error) {
    console.error("auth_reset_update_failed", errorCode(updated.error));
    // The recovery session is not kept without a new password; the link is spent, so a new one is asked for.
    await dropRefusedSession(supabase, "auth_reset_signout_failed");
    return "failed";
  }
  return "done";
}

export type EmailLinkResult = "signed_in" | "invalid" | "not_allowed";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Ends a session that was just made for an address outside ALLOWED_EMAILS.
 * When Supabase cannot sign it out, the session cookies are deleted here,
 * every chunk, so the answer never leaves with a session cookie set. Only the
 * fixed reason is logged.
 */
async function dropRefusedSession(supabase: SessionClient, event: string): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (!error) return;
  console.error(event, errorCode(error));
  await removeSessionCookies();
}

/** Ends the session just made in this request, for an address that turned out not to be allowed. */
export async function dropCurrentSession(event: string): Promise<void> {
  await dropRefusedSession(await createClient(), event);
}

/**
 * Exchanges the link's token hash for a session, which sets the cookies. When
 * `isAllowed` rejects the signed-in address, the new session is signed out again
 * on the same client, so no cookie for it remains.
 */
export async function verifyEmailLink(
  tokenHash: string,
  isAllowed: (email: string | undefined) => boolean,
): Promise<EmailLinkResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) return "invalid";
  if (isAllowed(data.user?.email)) return "signed_in";
  await dropRefusedSession(supabase, "auth_link_signout_failed");
  return "not_allowed";
}

/**
 * Outcome of signing in with the code; `code` is Supabase's error code when it
 * refused the code. `rate_limited` is Supabase's own limit on checks.
 */
export type EmailCodeOutcome = { result: EmailLinkResult | "rate_limited"; code?: string };

/** Supabase's answers when too many checks come from one IP. */
function isRateLimit(error: { code?: string; status?: number }): boolean {
  return error.code === "over_request_rate_limit" || error.status === 429;
}

/**
 * Signs in with the six-digit code from the same e-mail as the link (AD-3,
 * AD-27). Supabase checks the code, its lifetime (`otp_expiry`) and its rate
 * limit, and the code and the link are one token: once either is used, both
 * are. `forwardedFor` is the browser's IP for Supabase's per-IP limits. As
 * with the link, an address that `isAllowed` rejects is signed out again at
 * once, and its cookies are deleted if that fails.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  isAllowed: (email: string | undefined) => boolean,
  { forwardedFor }: { forwardedFor?: string | null } = {},
): Promise<EmailCodeOutcome> {
  const supabase = await createClient({ forwardedFor });
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return { result: isRateLimit(error) ? "rate_limited" : "invalid", code: errorCode(error) };
  if (isAllowed(data.user?.email)) return { result: "signed_in" };
  await dropRefusedSession(supabase, "auth_code_signout_failed");
  return { result: "not_allowed" };
}

/** Outcome of signing out: whether this browser's session is gone, and Supabase's error code if something failed. */
export type SignOutOutcome = { signedOut: boolean; code?: string };

function errorCode(error: { code?: string; status?: number }): string {
  return String(error.code ?? error.status ?? "unknown");
}

/**
 * Ends the session in this browser: Supabase revokes it and the client
 * removes the session cookies. `local` scope, so other devices where Pontus
 * is signed in stay signed in. When revoking fails, Supabase still removes
 * the cookies in most cases, so what counts is whether a session is left;
 * when that cannot be told (getClaims fails for another reason than a
 * missing session), the session counts as left.
 */
export async function endSession(): Promise<SignOutOutcome> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (!error) return { signedOut: true };
  const code = errorCode(error);
  const claims = await supabase.auth.getClaims();
  if (claims.error && !isAuthSessionMissingError(claims.error)) return { signedOut: false, code };
  return { signedOut: !claims.data?.claims, code };
}

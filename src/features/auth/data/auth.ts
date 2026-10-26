import "server-only";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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

export type EmailLinkResult = "signed_in" | "invalid" | "not_allowed";

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
  await supabase.auth.signOut({ scope: "local" });
  return "not_allowed";
}

/** Outcome of signing in with the code; `code` is Supabase's error code when it refused the code. */
export type EmailCodeOutcome = { result: EmailLinkResult; code?: string };

/**
 * Signs in with the six-digit code from the same e-mail as the link (AD-3,
 * AD-27). Supabase checks the code, its lifetime (`otp_expiry`) and its rate
 * limit, and the code and the link are one token: once either is used, both
 * are. As with the link, an address that `isAllowed` rejects is signed out
 * again on the same client, so no cookie for it remains.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  isAllowed: (email: string | undefined) => boolean,
): Promise<EmailCodeOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) return { result: "invalid", code: errorCode(error) };
  if (isAllowed(data.user?.email)) return { result: "signed_in" };
  await supabase.auth.signOut({ scope: "local" });
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

import "server-only";
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

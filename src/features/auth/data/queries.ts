import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import type { User } from "../domain/user";

/**
 * The signed-in user, or null (AD-3). Verifies the session with getClaims(),
 * never getSession(), and requires the address to be in ALLOWED_EMAILS.
 * Memoised per request with React cache.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const { sub, email } = data.claims;
  if (typeof sub !== "string" || typeof email !== "string") return null;
  if (!isAllowedEmail(email, env.ALLOWED_EMAILS ?? [])) return null;

  return { id: sub, email: normalizeEmail(email) };
});

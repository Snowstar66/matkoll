import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";
import { isAllowedEmail, normalizeEmail } from "../domain/allowed-email";
import type { User } from "../domain/user";
import { dropCurrentSession } from "./auth";
import { householdLetsIn } from "./household-access";

/**
 * The signed-in user, or null (AD-3). Verifies the session with getClaims(),
 * never getSession(), and requires the address to be in ALLOWED_EMAILS, or
 * (Story 21.2b) the person to be a member of a household with someone on that
 * list. Memoised per request with React cache.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const { sub, email } = data.claims;
  if (typeof sub !== "string" || typeof email !== "string") return null;
  const allowed = env.ALLOWED_EMAILS ?? [];
  if (!isAllowedEmail(email, allowed) && !(await householdLetsIn(supabase, allowed))) return null;

  return { id: sub, email: normalizeEmail(email) };
});

/**
 * Story 21.2b: after leaving a household, whether the person still has access
 * (asked again, not memoised); when not, the session is ended here, so the
 * caller only has to send them to the login page.
 */
export async function keepSessionOnlyWithAccess(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  const allowed = env.ALLOWED_EMAILS ?? [];
  if (typeof email === "string" && (isAllowedEmail(email, allowed) || (await householdLetsIn(supabase, allowed)))) return true;
  await dropCurrentSession("household_leave_signout_failed");
  return false;
}

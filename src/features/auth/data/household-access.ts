import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "../domain/allowed-email";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Story 21.2b: whether the signed-in person may use the app through their
 * household, without being in ALLOWED_EMAILS themselves. ALLOWED_EMAILS stays
 * the way a household is let in: a person is let in when they are a member of a
 * household in which someone's address is on the list (an invited member). A
 * member who left or was removed has a household of their own and no one on
 * the list in it, so they are not, until a new invitation. False when the
 * members cannot be read. The addresses are read with household_members(),
 * which shows only the caller's own household.
 */
export async function householdLetsIn(db: SessionClient, allowed: readonly string[]): Promise<boolean> {
  if (allowed.length === 0) return false;
  const { data, error } = await db.rpc("household_members");
  if (error || !data) return false;
  return data.some((member) => member.is_me) && data.some((member) => isAllowedEmail(member.email, allowed));
}

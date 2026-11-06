import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "../domain/allowed-email";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Whether the signed-in person may use the app through their household, without
 * being in ALLOWED_EMAILS themselves. Two ways in, both about someone in the
 * person's own household (the person included):
 *  - Story 21.2b: an address on ALLOWED_EMAILS is a member. The addresses are read
 *    with household_members(), which shows only the caller's own household.
 *  - Story 21.1: a member holds an app invitation from the owner that has been used
 *    (app_invited_access(), the database's allow list). Removing the invitation
 *    takes the access from that person and from the members who got in only
 *    through them.
 * A member who left or was removed has a household of their own and no one on a
 * list in it, so they are not, until a new invitation. False when the answer
 * cannot be read.
 */
export async function householdLetsIn(db: SessionClient, allowed: readonly string[]): Promise<boolean> {
  if (allowed.length > 0) {
    const { data, error } = await db.rpc("household_members");
    if (!error && data && data.some((member) => member.is_me) && data.some((member) => isAllowedEmail(member.email, allowed))) return true;
  }
  const { data: invited, error } = await db.rpc("app_invited_access");
  return !error && invited === true;
}

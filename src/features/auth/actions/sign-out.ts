"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devLoggedOutCookie, devLoggedOutMaxAgeSeconds } from "@/lib/supabase/dev-auto-login";
import { devAutoLoginApplies } from "@/lib/supabase/dev-auto-login-server";
import { fail, type Result } from "@/lib/errors";
import { endSession } from "../data/auth";

/**
 * "Logga ut" in Inställningar (FR1): ends the session in this browser on the
 * server and sends Pontus to /logga-in; after that, every page asks for a
 * sign-in again. Unlike other actions it does not start with requireUser():
 * it writes no user data, and a session that requireUser() refuses (an
 * address no longer in ALLOWED_EMAILS) should be ended too. Returns
 * `auth_sign_out_failed` only when a session is left.
 */
export async function signOut(): Promise<Result<never>> {
  const outcome = await endSession();
  if (!outcome.signedOut) {
    console.error("auth_sign_out_failed", outcome.code);
    return fail("auth_sign_out_failed");
  }
  // The session is gone here, but Supabase could not revoke it on its side.
  if (outcome.code) console.error("auth_sign_out_revoke_failed", outcome.code);
  // Story 15.1: a logout must not be undone by the local auto-login on the next page load.
  if (await devAutoLoginApplies()) {
    (await cookies()).set(devLoggedOutCookie, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: devLoggedOutMaxAgeSeconds,
    });
  }
  redirect("/logga-in");
}

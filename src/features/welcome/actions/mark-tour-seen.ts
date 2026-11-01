"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { saveTourSeenIn, WelcomeTourDataError } from "../data/welcome-tour";

/**
 * Records that the signed-in user has seen the welcome tour (Story 20.1), on the server, so no other
 * device shows it again. Called when the tour is closed in any way. Nothing is revalidated: the
 * tour that called it is already closed. Fails with `unauthorized` or `welcome_tour_save_failed`.
 */
export async function markTourSeen(): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  try {
    await saveTourSeenIn(await createClient());
  } catch (error) {
    if (!(error instanceof WelcomeTourDataError)) throw error;
    console.error("welcome_tour_save_failed", { reason: error.detail });
    return fail("welcome_tour_save_failed");
  }
  return ok(null);
}

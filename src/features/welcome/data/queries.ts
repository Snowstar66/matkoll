import "server-only";
import { getCurrentUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import { loadTourSeenIn, WelcomeTourDataError } from "./welcome-tour";

/**
 * Whether the app should leave the welcome tour out for the signed-in user (Story 20.1): true when
 * they have seen it, and also without a session or when it cannot be read (logged, code only), so a
 * failure never puts the tour in front of someone who has seen it.
 */
export async function hasSeenWelcomeTour(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return true;
  try {
    return await loadTourSeenIn(await createClient());
  } catch (error) {
    if (!(error instanceof WelcomeTourDataError)) throw error;
    console.error("welcome_tour_unavailable", { reason: error.detail });
    return true;
  }
}

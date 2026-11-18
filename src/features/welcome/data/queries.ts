import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import { tourSeenCookie } from "../domain/tour-cookie";
import { loadTourSeenIn, WelcomeTourDataError } from "./welcome-tour";

/**
 * Whether the app should leave the welcome tour out for the signed-in user (Story 20.1): true when
 * they have seen it, and also without a session or when it cannot be read (logged, code only), so a
 * failure never puts the tour in front of someone who has seen it. A device that has been told the person
 * has seen it (the cookie, set by the welcome gate) skips the query.
 */
export async function hasSeenWelcomeTour(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return true;
  if ((await cookies()).get(tourSeenCookie)?.value === user.id) return true;
  try {
    return await loadTourSeenIn(await createClient());
  } catch (error) {
    if (!(error instanceof WelcomeTourDataError)) throw error;
    console.error("welcome_tour_unavailable", { reason: error.detail });
    return true;
  }
}

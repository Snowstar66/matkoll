"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devLoggedOutCookie } from "@/lib/supabase/dev-auto-login";

/** Dev only (Story 15.1): "Logga in automatiskt igen" clears the logout marker. Harmless elsewhere. */
export async function resumeDevAutoLogin(): Promise<void> {
  (await cookies()).delete(devLoggedOutCookie);
  redirect("/");
}

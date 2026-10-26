import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseConfig } from "./config";
import type { Database } from "./database.types";

/**
 * Supabase client bound to the signed-in user's session cookies (AD-3, AD-4).
 * Create one per request; it never uses the service role.
 */
export async function createClient() {
  // Session data is per request: never part of a prerender, where the client's
  // Date.now() expiry checks are not allowed (AD-18).
  await connection();
  const cookieStore = await cookies();
  const { url, key } = supabaseConfig();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The proxy has already
          // refreshed the session for this request, so this is safe to ignore.
        }
      },
    },
  });
}

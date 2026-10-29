import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { authCookieOptions, supabaseConfig } from "./config";
import type { Database } from "./database.types";

export type CreateClientOptions = {
  /**
   * The browser's IP, sent to Supabase Auth as `Sb-Forwarded-For`, so that
   * Auth's per-IP limits count the person and not the Next server. Auth uses
   * it only where the project has turned it on; otherwise it is ignored.
   */
  forwardedFor?: string | null;
};

/**
 * Supabase client bound to the signed-in user's session cookies (AD-3, AD-4).
 * Create one per request; it never uses the service role.
 */
export async function createClient({ forwardedFor }: CreateClientOptions = {}) {
  // Session data is per request: never part of a prerender, where the client's
  // Date.now() expiry checks are not allowed (AD-18).
  await connection();
  const cookieStore = await cookies();
  const { url, key } = supabaseConfig();

  return createServerClient<Database>(url, key, {
    ...(forwardedFor ? { global: { headers: { "Sb-Forwarded-For": forwardedFor } } } : {}),
    cookieOptions: authCookieOptions(),
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

/** The session cookie and its chunks (`sb-<ref>-auth-token`, `.0`, `.1` …), not the PKCE verifier. */
export const sessionCookieName = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Deletes the session cookies of this request, every chunk, as a last resort
 * when Supabase could not sign a session out. Only in a Server Action or a
 * Route Handler, where cookies can be set. Returns how many were deleted.
 */
export async function removeSessionCookies(): Promise<number> {
  const cookieStore = await cookies();
  const names = cookieStore
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) => sessionCookieName.test(name));
  for (const name of names) cookieStore.delete(name);
  return names.length;
}

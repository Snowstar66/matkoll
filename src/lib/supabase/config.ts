import "server-only";
import { env } from "@/server/env";

/** Supabase URL or publishable key is missing from the environment. */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("supabase_not_configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    this.name = "SupabaseNotConfiguredError";
  }
}

/**
 * The URL and publishable key for the session clients. They are optional in the
 * environment schema (preview deployments have no Supabase, AD-23), so a missing
 * value fails here, on first use, with a message that names no values.
 */
export function supabaseConfig(): { url: string; key: string } {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new SupabaseNotConfiguredError();
  return { url, key };
}

/** The session lasts 90 days from the last refresh (Story 15.2). */
export const sessionMaxAgeSeconds = 90 * 24 * 60 * 60;

/**
 * Cookie options for the session cookies (Story 15.2). The app has no browser
 * client, so the cookies can be httpOnly. `secure` follows the site's own
 * scheme (or production), so `pnpm dev` over http://localhost still works.
 */
export function authCookieOptions() {
  return {
    maxAge: sessionMaxAgeSeconds,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: env.NODE_ENV === "production" || env.SITE_URL.startsWith("https://"),
  };
}

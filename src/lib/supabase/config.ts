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

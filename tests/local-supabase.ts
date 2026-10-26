// Tests create and delete Supabase users with the service role. They may only do
// that against local Supabase, never a cloud project.

const localHosts = new Set(["127.0.0.1", "localhost"]);

/** Returns the Supabase URL if it points at local Supabase, otherwise throws. */
export function localSupabaseUrl(url = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  if (!url) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL to local Supabase (pnpm db:start && pnpm db:env)");
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
  }
  if (!localHosts.has(host)) {
    throw new Error(
      `Refusing to run: NEXT_PUBLIC_SUPABASE_URL points at ${host}, not local Supabase (127.0.0.1 or localhost). These tests create and delete users.`,
    );
  }
  return url;
}

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseConfig } from "./config";

export { SupabaseNotConfiguredError } from "./config";
import type { Database } from "./database.types";

export type SessionUpdate = {
  /** The response to continue with; carries refreshed session cookies. */
  response: NextResponse;
  /** True when the request has a valid, possibly just refreshed, session. */
  hasSession: boolean;
};

/**
 * Refreshes the Supabase session for the proxy (AD-3). `getClaims()` verifies
 * the access token and refreshes it when it has expired; new cookies are written
 * to both the forwarded request and the response.
 */
export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  // Nothing may run between creating the client and getClaims() (Supabase SSR guide).
  const { data, error } = await supabase.auth.getClaims();
  return { response, hasSession: !error && Boolean(data?.claims?.sub) };
}

/** Builds a redirect that keeps any session cookies the refresh wrote. */
export function redirectWithSession(target: URL, session: SessionUpdate): NextResponse {
  const redirect = NextResponse.redirect(target, 307);
  for (const cookie of session.response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = session.response.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}

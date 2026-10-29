import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { devAutoLoginCredentials, devLoggedOutCookie, hasProxyHeaders } from "./dev-auto-login";
import { env } from "@/server/env";
import { authCookieOptions, supabaseConfig } from "./config";

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
function createProxyClient(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();

  const supabase = createServerClient<Database>(url, key, {
    cookieOptions: authCookieOptions(),
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

  return { supabase, response: () => response };
}

export async function updateSession(request: NextRequest): Promise<SessionUpdate> {
  const { supabase, response } = createProxyClient(request);
  // Nothing may run between creating the client and getClaims() (Supabase SSR guide).
  const { data, error } = await supabase.auth.getClaims();
  return { response: response(), hasSession: !error && Boolean(data?.claims?.sub) };
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

/** After one failed auto-login nothing is retried until the process restarts (no log noise). */
let devAutoLoginFailed = false;

/**
 * Story 15.1: signs in Pontus's local user with a password when every guard in
 * devAutoLoginCredentials holds (development, not Vercel, a local host and a
 * local Supabase, both variables set). Returns a redirect to the same page with
 * the session cookies, or null when a guard fails or the sign-in does not work,
 * so the normal login is used. Uses the publishable key like any sign-in, never
 * the service role. Logs nothing about the e-mail or the password.
 */
export async function devAutoLoginRedirect(request: NextRequest): Promise<NextResponse | null> {
  // Pontus logged out on purpose; stay logged out until he asks for it on /logga-in.
  if (request.cookies.has(devLoggedOutCookie)) return null;
  if (devAutoLoginFailed) return null;
  const credentials = devAutoLoginCredentials({
    nodeEnv: env.NODE_ENV,
    vercel: env.VERCEL,
    loopbackFlag: env.MATKOLL_DEV_LOOPBACK,
    proxied: hasProxyHeaders(request.headers),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    email: env.DEV_AUTO_LOGIN_EMAIL,
    password: env.DEV_AUTO_LOGIN_PASSWORD,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (!credentials) return null;

  const { supabase, response } = createProxyClient(request);
  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error) {
    devAutoLoginFailed = true;
    console.warn("dev_auto_login_failed");
    return null;
  }
  const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, request.url);
  return redirectWithSession(target, { response: response(), hasSession: true });
}

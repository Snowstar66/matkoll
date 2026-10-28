import { type NextRequest, NextResponse } from "next/server";
import {
  redirectWithSession,
  type SessionUpdate,
  SupabaseNotConfiguredError,
  updateSession,
} from "@/lib/supabase/proxy";

// Optimistic check (AD-3): refreshes the session on every request and sends page
// requests without a session to the login page. The authoritative check is
// requireUser() in pages, actions and Route Handlers, which also checks
// ALLOWED_EMAILS; non-GET requests and /api/* pass through so they can answer
// with `unauthorized` / 401 themselves.

const publicPaths = ["/logga-in", "/auth/confirm"];

function isPublic(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isPageRequest(request: NextRequest) {
  const { method } = request;
  const { pathname } = request.nextUrl;
  return (method === "GET" || method === "HEAD") && !pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  let session: SessionUpdate;
  try {
    session = await updateSession(request);
  } catch (error) {
    // E.g. a preview deployment without Supabase variables (AD-23): answer plainly instead of a 500.
    if (!(error instanceof SupabaseNotConfiguredError)) throw error;
    console.error("supabase_not_configured");
    return new NextResponse("Matkoll är inte konfigurerad.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const { pathname, search } = request.nextUrl;

  if (session.hasSession || isPublic(pathname) || !isPageRequest(request)) {
    return session.response;
  }

  const login = new URL("/logga-in", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return redirectWithSession(login, session);
}

export const config = {
  matcher: [
    // Everything except Next's static output and image optimisation, a short
    // list of files (/favicon.ico, /manifest.webmanifest, /robots.txt,
    // /sitemap.xml) and the generated app icons (/icon, /icon/<id>,
    // /apple-icon, /apple-icon/<id>; AD-27), which must load without a session
    // to put Matkoll on the home screen. A path with a dot, like /recept/x.json,
    // goes through the proxy like any other (there is no public/ folder).
    "/((?!_next/static|_next/image|(?:favicon\\.ico|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml)$|(?:apple-)?icon(?:/[a-zA-Z0-9_-]+)?$).*)",
  ],
};

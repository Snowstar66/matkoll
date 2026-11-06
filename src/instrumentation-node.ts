import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { readBuildInfo } from "@/app/build-info";
import { insertErrorReportIn } from "@/features/feedback/data/feedback";
import { buildErrorReport, rawErrorOf, reportKey, reportVersion } from "@/features/feedback/domain/error-report";
import { authCookieOptions, supabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

// Node.js-only part of src/instrumentation.ts (process.exit is not available on Edge).
export async function validateEnvOrExit() {
  try {
    await import("@/server/env");
  } catch (error) {
    // EnvError messages name variables, never values, so they are safe to log.
    console.error(error instanceof Error ? error.message : "env_invalid");
    process.exit(1);
  }
}

/** The same error on the same path is reported once per 10 minutes by this server process. */
const dedupeMs = 10 * 60 * 1000;
const recent = new Map<string, number>();

function seenRecently(key: string, now: number): boolean {
  for (const [other, at] of recent) if (now - at > dedupeMs) recent.delete(other);
  if (recent.has(key)) return true;
  if (recent.size >= 200) return true;
  recent.set(key, now);
  return false;
}

function headerOf(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join("; ") : (value ?? "");
}

/**
 * Next's onRequestError (pages, Server Actions, Route Handlers): puts the error in the
 * owner's inbox as kind error, attributed to the signed-in user. No service role: it
 * inserts with the request's own session cookie, as the user, so RLS and the limit of 5
 * per 10 minutes apply as for the browser's reports. Without a session (or an expired
 * one) nothing is stored. Only the error, the path without query, the digest and the
 * version are used: never the request's headers, body or cookies beyond the session.
 * Never throws.
 */
export async function reportRequestError(
  thrown: unknown,
  request: { path: string; headers: Record<string, string | string[] | undefined> },
): Promise<void> {
  try {
    const error = rawErrorOf(thrown);
    const report = buildErrorReport({ ...error, path: request.path, source: "server" });
    if (!report) return;
    if (seenRecently(reportKey(error, request.path), Date.now())) return;
    const cookieHeader = headerOf(request.headers, "cookie");
    if (!cookieHeader) return;
    const { url, key } = supabaseConfig();
    const db = createServerClient<Database>(url, key, {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll: () => parseCookieHeader(cookieHeader).map(({ name, value }) => ({ name, value: value ?? "" })),
        setAll: () => {},
      },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await insertErrorReportIn(db, report, reportVersion(readBuildInfo()));
  } catch {
    // Reporting an error must never become one.
  }
}

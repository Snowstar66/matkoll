import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { readBuildInfo } from "@/app/build-info";
import { insertErrorReportIn } from "@/features/feedback/data/feedback";
import { buildErrorReport, rawErrorOf, reportKey, reportVersion } from "@/features/feedback/domain/error-report";
import { supabaseConfig } from "@/lib/supabase/config";
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
const maxRemembered = 200;
const recent = new Map<string, number>();

/** Whether the key was reported lately; otherwise remembers it, and at the cap forgets the oldest, never suppressing everything. */
function seenRecently(key: string, now: number): boolean {
  for (const [other, at] of recent) {
    if (now - at > dedupeMs) recent.delete(other);
  }
  if (recent.has(key)) return true;
  while (recent.size >= maxRemembered) {
    const oldest = recent.keys().next().value;
    if (oldest === undefined) break;
    recent.delete(oldest);
  }
  recent.set(key, now);
  return false;
}

function headerOf(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join("; ") : (value ?? "");
}

const sessionCookie = /^sb-.+-auth-token(\.\d+)?$/;
const reportTimeoutMs = 2000;
const expirySlackSeconds = 10;

function decodeBase64Url(text: string): string {
  return Buffer.from(text, "base64url").toString("utf8");
}

/**
 * The session's access token from the request's cookies, or null when there is none or it
 * has expired. Only reads: the refresh token is never used, so the report cannot rotate it
 * under the user's feet.
 */
export function accessTokenFromCookies(cookieHeader: string, nowSeconds: number): string | null {
  const parts = parseCookieHeader(cookieHeader)
    .filter(({ name }) => sessionCookie.test(name))
    .sort((a, b) => Number(a.name.split(".")[1] ?? 0) - Number(b.name.split(".")[1] ?? 0));
  if (parts.length === 0) return null;
  try {
    let raw = parts.map(({ value }) => value ?? "").join("");
    if (raw.startsWith("base64-")) raw = decodeBase64Url(raw.slice("base64-".length));
    const token: unknown = (JSON.parse(raw) as { access_token?: unknown }).access_token;
    if (typeof token !== "string") return null;
    const payload = JSON.parse(decodeBase64Url(token.split(".")[1] ?? "")) as { exp?: unknown };
    if (typeof payload.exp !== "number" || payload.exp < nowSeconds + expirySlackSeconds) return null;
    return token;
  } catch {
    return null;
  }
}

/**
 * Next's onRequestError (pages, Server Actions, Route Handlers): puts the error in the
 * owner's inbox as kind error, attributed to the signed-in user. No service role: it
 * inserts with the request's own access token (a Bearer header, no session and no refresh),
 * as the user, so RLS and the limits of the database apply as for the browser's reports.
 * Without a valid token nothing is stored. Only the error, the path without query, the
 * digest and the version are used: never the request's headers or body. Next awaits this
 * on the error path, so it gives up after 2 seconds. Never throws.
 */
export async function reportRequestError(
  thrown: unknown,
  request: { path: string; headers: Record<string, string | string[] | undefined> },
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const error = rawErrorOf(thrown);
    const report = buildErrorReport({ ...error, path: request.path, source: "server" });
    if (!report) return;
    const now = Date.now();
    const token = accessTokenFromCookies(headerOf(request.headers, "cookie"), Math.floor(now / 1000));
    if (!token) return;
    if (seenRecently(reportKey(error, request.path), now)) return;
    const { url, key } = supabaseConfig();
    const db = createServerClient<Database>(url, key, {
      // No cookies: the access token goes as a header, so no session is ever refreshed.
      cookies: { getAll: () => [], setAll: () => {} },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(reportTimeoutMs) }),
      },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const gaveUp = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, reportTimeoutMs);
    });
    await Promise.race([insertErrorReportIn(db, report, reportVersion(readBuildInfo())).then(() => undefined), gaveUp]);
  } catch {
    // Reporting an error must never become one.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Story 15.1: automatic sign-in on Pontus's own machine. Every guard must hold;
// when one fails nothing happens and the normal login is used. Pure, so each
// guard has a unit test. Never log the e-mail or the password.

export type DevAutoLoginInput = {
  nodeEnv: string | undefined;
  /** `process.env.VERCEL`: set on every Vercel build and runtime. */
  vercel: string | undefined;
  /** The Host header of the request. */
  host: string | null | undefined;
  /** X-Forwarded-Host when present (a proxy or tunnel in front); it must be local too. */
  forwardedHost?: string | null;
  /** `MATKOLL_DEV_LOOPBACK`: only `pnpm dev` sets it, and that binds to 127.0.0.1. `pnpm dev:lan` does not. */
  loopbackFlag?: string | undefined;
  /** True when the request carries x-forwarded-for, x-real-ip or forwarded (a proxy, tunnel or LAN hop). */
  proxied?: boolean;
  email: string | undefined;
  password: string | undefined;
  supabaseUrl: string | undefined;
};

/** Short-lived cookie set by signOut so that a logout is not undone by the next page load. */
export const devLoggedOutCookie = "matkoll-dev-logged-out";
export const devLoggedOutMaxAgeSeconds = 8 * 60 * 60;

/** True when any header that proxies and tunnels add is present. */
export function hasProxyHeaders(headers: { get(name: string): string | null }): boolean {
  return ["x-forwarded-for", "x-real-ip", "forwarded"].some((name) => headers.get(name) !== null);
}

const localHostnames = new Set(["localhost", "127.0.0.1"]);

/** True for `localhost` or `127.0.0.1`, with or without a port. Nothing else, not even `::1`. */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const match = /^([a-z0-9.-]+)(?::\d{1,5})?$/i.exec(host.trim());
  return match !== null && localHostnames.has(match[1].toLowerCase());
}

export function isLocalUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return localHostnames.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** The credentials to sign in with, or null when any guard fails. */
export function devAutoLoginCredentials(input: DevAutoLoginInput): { email: string; password: string } | null {
  if (input.nodeEnv !== "development") return null;
  if (input.vercel) return null;
  if (input.loopbackFlag !== "1") return null;
  if (input.proxied) return null;
  if (!isLocalHost(input.host)) return null;
  if (input.forwardedHost && !isLocalHost(input.forwardedHost)) return null;
  const email = input.email?.trim();
  const password = input.password;
  if (!email || !password) return null;
  if (!isLocalUrl(input.supabaseUrl)) return null;
  return { email, password };
}

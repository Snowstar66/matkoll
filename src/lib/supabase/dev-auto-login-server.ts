import "server-only";
import { headers } from "next/headers";
import { env } from "@/server/env";
import { devAutoLoginCredentials, hasProxyHeaders } from "./dev-auto-login";

/** True when the current request meets every auto-login guard (Story 15.1). */
export async function devAutoLoginApplies(): Promise<boolean> {
  const h = await headers();
  return (
    devAutoLoginCredentials({
      nodeEnv: env.NODE_ENV,
      vercel: env.VERCEL,
      loopbackFlag: env.MATKOLL_DEV_LOOPBACK,
      proxied: hasProxyHeaders(h),
      host: h.get("host"),
      forwardedHost: h.get("x-forwarded-host"),
      email: env.DEV_AUTO_LOGIN_EMAIL,
      password: env.DEV_AUTO_LOGIN_PASSWORD,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    }) !== null
  );
}

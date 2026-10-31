import { requireUserForRoute } from "@/features/auth/server";
import { fail, ok } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { isCrossSite, respond } from "../../ai/route-support";

// What the browser needs to listen to Supabase Realtime (Story 17.7, FR-15).
// The session cookies are httpOnly and the app has no browser client (AD-3),
// so the signed-in user's own short-lived access token, the project's
// publishable key and the user's id come from here. The token is only used to
// open the realtime socket as that user, which keeps the row-level security
// of every table; it is never stored. `no-store`: it is per user and per time.

export async function GET(request: Request): Promise<Response> {
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  // getCurrentUser verified the session with getClaims(); this only reads its token.
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return respond(fail("unauthorized"));
  const { url, key } = supabaseConfig();
  const response = respond(
    ok({ url, key, userId: auth.user.id, accessToken: session.access_token, expiresAt: session.expires_at ?? null }),
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

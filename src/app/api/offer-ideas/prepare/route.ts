import { requireUser } from "@/features/auth/server";
import { prepareOfferIdeasNow } from "@/features/suggestions/server";
import { fail, ok } from "@/lib/errors";
import { actAsSession } from "@/lib/supabase/acting";
import { createKeyClient } from "@/lib/supabase/server";
import { respond } from "../../ai/route-support";

// POST /api/offer-ideas/prepare: the last step of the scheduled offers job (.github/workflows/offers.yml, scripts/offer-ideas.ts).
// The job has just fetched the week's offers and signed in as a member of each household that has offers and no
// ready set; for each it calls this route with that member's session (Authorization: Bearer <access token>,
// X-Refresh-Token), and the route prepares the household's "Nya idéer med extrapris" now, so the first person to
// open the app finds them ready. The route runs as that member: createClient() answers the token session
// (actAsSession), so RLS limits everything to the member's household and the same code runs as for a tap on
// "Hämta veckans erbjudanden". The service role never reaches the app (AD-4), and no cookie is read here, so a
// browser session can neither start nor be mistaken for this. The claim keeps a rerun from making a second set.
// The model has its own 100 s deadline; one household per request fits maxDuration with room. Answers the
// outcome only (prepared, failed, skipped, none, unavailable), never a name or an idea.
export const maxDuration = 300;

function bearer(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

export async function POST(request: Request): Promise<Response> {
  const accessToken = bearer(request);
  const refreshToken = request.headers.get("x-refresh-token")?.trim();
  if (!accessToken || !refreshToken) return respond(fail("unauthorized"));
  const db = createKeyClient();
  const session = await db.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (session.error || !session.data.session) return respond(fail("unauthorized"));
  return actAsSession(db, async () => {
    const user = await requireUser();
    if (!user.ok) return respond(user);
    return respond(ok({ outcome: await prepareOfferIdeasNow() }));
  });
}

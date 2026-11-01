import { requireUserForRoute } from "@/features/auth/server";
import { maxNewsRows, sinceFor, type NewsAnswer } from "@/lib/news";
import { listShoppingNews, ShoppingDataError } from "@/features/shopping/server";
import { listCardNews, ThingsDataError } from "@/features/things/server";
import { fail, ok } from "@/lib/errors";
import { respond } from "../ai/route-support";

// Brickor (Story 23.1): GET /api/news?lista=<iso>&prylar=<iso> lists what was
// added on Inköpslista and in Förråd after each time (this device's "last
// seen"), as keys only: ids and line keys, never a label or a photo. The
// device leaves out its own changes and counts the rest. A tab without a time
// gets nothing, only the server's time, which the device keeps as its start.
// Read with the session client, so RLS limits it to the household's rows.

export async function GET(request: Request): Promise<Response> {
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const now = new Date();
  const lista = sinceFor(params.get("lista"), now);
  const prylar = sinceFor(params.get("prylar"), now);
  try {
    const [listaNews, prylarNews] = await Promise.all([
      lista ? listShoppingNews(lista, maxNewsRows) : [],
      prylar ? listCardNews(prylar, maxNewsRows) : [],
    ]);
    const answer: NewsAnswer = { now: now.toISOString(), news: { lista: listaNews, prylar: prylarNews } };
    return respond(ok(answer));
  } catch (error) {
    if (!(error instanceof ShoppingDataError) && !(error instanceof ThingsDataError)) throw error;
    console.error("news_unavailable", { reason: error.detail });
    return respond(fail("news_unavailable"), 503);
  }
}

import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { refreshCardSummary } from "@/features/things/server";
import { fail, type Result } from "@/lib/errors";
import { isCrossSite, mediaTypeOf, readCapped, respond, unreadBody } from "../../ai/route-support";

// "Uppdatera sammanfattningen" on a card: JSON with the `card`; the answer is the new line and short name, kept on the
// card. A Route Handler rather than a Server Action, so the wait (at most 30 s) never queues the page's other actions.

export const maxDuration = 60;

const bodySchema = z.object({ card: z.uuid() });

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "application/json") return respond(fail("validation"), 415);
  const body = await readCapped(request, 1_024);
  if (!body.ok) return body.reason === "too_large" ? respond(fail("validation"), 413) : unreadBody(body.reason);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(body.bytes));
  } catch {
    return respond(fail("validation"));
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return respond(fail("validation"));

  let result: Result<{ summary: string | null; title: string | null }>;
  try {
    result = await refreshCardSummary(parsed.data.card);
  } catch (error) {
    console.error("things_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    result = fail("things_unavailable");
  }
  return respond(result);
}

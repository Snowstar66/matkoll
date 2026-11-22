import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { explainThingWorth } from "@/features/things/server";
import { fail, type Result } from "@/lib/errors";
import { isCrossSite, mediaTypeOf, readCapped, respond, unreadBody } from "../../ai/route-support";

// Undersök värdet (Värdetips): JSON with the `thing`; the answer is the fuller explanation of why it was flagged,
// kept on the föremål, so the AI is asked once. A Route Handler rather than a Server Action, so the wait (at most
// 45 s) never queues the page's other actions behind it.

export const maxDuration = 60;

const bodySchema = z.object({ thing: z.uuid() });

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

  let result: Result<{ detail: string }>;
  try {
    result = await explainThingWorth(parsed.data.thing);
  } catch (error) {
    console.error("things_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    result = fail("things_unavailable");
  }
  return respond(result);
}

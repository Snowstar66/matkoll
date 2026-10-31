import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { retryCardReading } from "@/features/things/server";
import type { AiJob } from "@/lib/ai-job-shape";
import { fail, ok, type Result } from "@/lib/errors";
import { isCrossSite, mediaTypeOf, readCapped, respond, unreadBody } from "../../ai/route-support";

// "Försök igen" on a card whose reading did not go (Story 18.2, FR-46-FR-49,
// AD-28): JSON with the `card` and a `clientKey`. The stored photo is read
// again by a new AI job, in the background of this request; the answer is that
// job (202). The photo never leaves the server: it is read from the private
// bucket for the job and goes nowhere else.

export const maxDuration = 300;

const bodySchema = z.object({ card: z.uuid(), clientKey: z.uuid() });

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = Date.now();
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "application/json") return respond(fail("validation"), 415);
  const body = await readCapped(request, 2_048);
  if (!body.ok) return body.reason === "too_large" ? respond(fail("validation"), 413) : unreadBody(body.reason);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(body.bytes));
  } catch {
    return respond(fail("validation"));
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return respond(fail("validation"));

  let result: Result<{ job: AiJob }>;
  try {
    result = await retryCardReading({ cardId: parsed.data.card, clientKey: parsed.data.clientKey, requestStartedAt });
  } catch (error) {
    console.error("things_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    result = fail("things_unavailable");
  }
  return result.ok ? respond(ok({ job: result.data.job }), 202) : respond(result);
}

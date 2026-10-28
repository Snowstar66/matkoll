import { after } from "next/server";
import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { hasAiRunOnItsWay } from "@/features/pantry/server";
import { isSuggesting } from "@/features/suggestions/server";
import { fail } from "@/lib/errors";
import { getAiService, warmUpKinds, type WarmUpKind, type WarmUpOutcome } from "@/server/ai";
import { isCrossSite, mediaTypeOf, readCapped, respond, unreadBody } from "../route-support";
import { claimWarmUp } from "./warm-limit";

// Wakes the model before it is needed (Story 12.2, FR-45, AD-9). Lagersaldo
// asks for `image` and Recept for `text` when the page is shown
// (src/lib/ai-client.ts, warmAi). The answer is always 202 without a body
// for a valid request, at once: the warm-up runs after the response with
// after(), so the page never waits for it, and Pontus never sees it. Only
// LM Studio is called (the port's warmUp), and never with data of Pontus's.
//
// No warm-up while an AI call of the user's is on its way in this process
// (an analysis, a lookup of the numbers or AI-förslag), so a real call never
// waits behind it, nor when the same user woke the same kind less than
// warmIntervalMs ago (warm-limit.ts). Logged only as `ai_warm` with the kind
// and the outcome.

// The warm-up has at most 30 s (warmUpLimits); this leaves room around it.
export const maxDuration = 60;

/** Largest request body: `{"kind":"image"}` is 16 bytes. */
const maxBodyBytes = 256;

const warmRequestSchema = z.object({ kind: z.enum(warmUpKinds) });

function logWarm(kind: WarmUpKind, outcome: WarmUpOutcome): void {
  console.info("ai_warm", { kind, outcome });
}

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "application/json") return respond(fail("validation"), 415);
  const read = await readCapped(request, maxBodyBytes);
  if (!read.ok) return read.reason === "too_large" ? respond(fail("validation"), 413) : unreadBody(read.reason);

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(read.bytes));
  } catch {
    return respond(fail("validation"));
  }
  const parsed = warmRequestSchema.safeParse(body);
  if (!parsed.success) return respond(fail("validation"));
  const { kind } = parsed.data;

  const userId = auth.user.id;
  // A call on its way is checked first, so it never uses up the limit.
  if (hasAiRunOnItsWay(userId) || isSuggesting(userId) || !claimWarmUp(userId, kind)) {
    logWarm(kind, "skipped");
  } else {
    // Never request.signal: it no longer holds once the response is sent. The port has its own 30 s.
    after(async () => {
      const outcome = await getAiService()
        .warmUp(kind, new AbortController().signal)
        .catch((): WarmUpOutcome => "unavailable");
      logWarm(kind, outcome);
    });
  }
  return new Response(null, { status: 202 });
}

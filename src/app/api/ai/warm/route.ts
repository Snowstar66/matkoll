import { after } from "next/server";
import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { getAiJobActivity } from "@/features/ai-jobs/server";
import { getAiChoice } from "@/features/settings/server";
import { fail } from "@/lib/errors";
import { getAiServiceFor, warmUpKinds, type AiService, type WarmUpKind, type WarmUpResult } from "@/server/ai";
import { claimWarmUp, warmIntervalMs } from "@/server/ai/warm-limit";
import { isCrossSite, mediaTypeOf, readCapped, respond, unreadBody } from "../route-support";

// Wakes the model before it is needed (Story 12.2, FR-45, AD-9). Förråd
// asks for `image` and Recept for `text` when the page is shown
// (src/lib/ai-client.ts, warmAi). The answer is always 202 without a body
// for a valid request, at once: the warm-up runs after the response with
// after(), so the page never waits for it, and Pontus never sees it. Only
// LM Studio is called (the port's warmUp), and never with data of Pontus's.
//
// No warm-up while an AI call of the user's is on its way, asked again just
// before the model is called, so a real call never waits behind it: an AI job
// that is queued or running (read from ai_job, so it holds across server
// instances; every AI call is a job since Story 12.5). Nor within the limit
// per user and model: the AI jobs started or finished within it (ai_job
// again), and the limit in src/server/ai/warm-limit.ts, which keeps the
// warm-ups themselves; that one is best effort, since it lives in this
// server process. Logged only as `ai_warm` with the kind, the outcome,
// its reason and the time, never with a prompt or an answer.

// The warm-up has at most 50 s (warmUpLimits); this leaves room around it.
export const maxDuration = 60;

/** The warm-up's own deadline: within maxDuration, whatever the port's budget. */
const warmUpDeadlineMs = (maxDuration - 5) * 1000;

/** Largest request body: `{"kind":"image"}` is 16 bytes. */
const maxBodyBytes = 256;

const warmRequestSchema = z.object({ kind: z.enum(warmUpKinds) });

function logWarm(kind: WarmUpKind, result: WarmUpResult, durationMs: number): void {
  console.info("ai_warm", { kind, ...result, durationMs: Math.round(durationMs) });
}

/**
 * What the AI jobs of the user's say: one is queued or running (`busy`), or
 * one began or ended within the warm-up limit (`recent`). `null` when it
 * cannot be read, and then nothing is woken: it cannot be told whether the
 * model is in use.
 */
function jobActivity() {
  return getAiJobActivity(new Date(Date.now() - warmIntervalMs));
}

/** True while a real AI call of the user's is on its way: a job that is queued or running. */
async function isBusy(): Promise<boolean> {
  const activity = await jobActivity();
  return activity === null || activity.active;
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
  const accepted = new Response(null, { status: 202 });

  let modelKey: string | null;
  let service: AiService;
  try {
    // The user's own choice (Story 17.5), read once here: the cookies are gone inside after().
    service = getAiServiceFor(await getAiChoice());
    modelKey = service.warmUpKey(kind);
  } catch {
    // The AI settings could not be read: nothing to wake, and nothing to show.
    logWarm(kind, { outcome: "unavailable", reason: "connection" }, 0);
    return accepted;
  }
  if (modelKey === null) {
    logWarm(kind, { outcome: "skipped", reason: "provider" }, 0);
    return accepted;
  }
  // A call on its way is checked first, so it never uses up the limit.
  const activity = await jobActivity();
  if (activity === null || activity.active) {
    logWarm(kind, { outcome: "skipped", reason: "busy" }, 0);
    return accepted;
  }
  if (activity.recent || !claimWarmUp(userId, modelKey)) {
    logWarm(kind, { outcome: "skipped", reason: "limited" }, 0);
    return accepted;
  }

  // Never request.signal: it no longer holds once the response is sent.
  after(async () => {
    const started = performance.now();
    let result: WarmUpResult;
    try {
      result = await service.warmUp(kind, AbortSignal.timeout(warmUpDeadlineMs), {
        isBusy,
      });
    } catch {
      result = { outcome: "unavailable", reason: "connection" };
    }
    logWarm(kind, result, performance.now() - started);
  });
  return accepted;
}

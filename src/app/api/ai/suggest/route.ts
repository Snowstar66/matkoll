import { requireUserForRoute } from "@/features/auth/server";
import { suggestRequestSchema } from "@/features/suggestions";
import { suggestFromPantry } from "@/features/suggestions/server";
import { fail } from "@/lib/errors";
import { isCrossSite, mediaTypeOf, readCapped, respond, unreadBody } from "../route-support";

// AI-förslag from the pantry (FR-23, AD-9): the client posts through
// src/lib/ai-client.ts with the titles it already shows, and gets up to three
// RecipeDrafts back. The pantry is read here from the session; the client
// never sends it. Never writes to the database (AD-2). The request's signal
// goes all the way to the model, so "Avbryt" stops it.
//
// A run can keep the local model busy for up to 115 s, so only the app itself
// may start one: JSON only (a cross-site form cannot send it without a
// preflight), the app's own origin, and a small body.

// The AI port's budget is 115 s in total (AD-9). The whole request must fit:
// suggestFromPantry gets the deadline and gives the model the time left after
// the reads before it, with a margin for the reads after it.
export const maxDuration = 120;

/** Largest request body: three titles of 200 characters, as UTF-8 and JSON, fit well within it. */
const maxBodyBytes = 4 * 1024;

export async function POST(request: Request): Promise<Response> {
  const deadline = Date.now() + maxDuration * 1000;
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
  const parsed = suggestRequestSchema.safeParse(body);
  if (!parsed.success) return respond(fail("validation"));

  return respond(await suggestFromPantry(parsed.data, { signal: request.signal, deadline }));
}

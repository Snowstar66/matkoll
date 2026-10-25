import { requireUserForRoute } from "@/features/auth/server";
import { importRequestSchema } from "@/features/recipes";
import { importRecipe } from "@/features/recipes/server";
import { fail } from "@/lib/errors";
import { isCrossSite, mediaTypeOf, readCapped, respond, unreadBody } from "../route-support";

// Import of a recipe from pasted text or a link (AD-9, AD-11): the client
// posts through src/lib/ai-client.ts and gets a RecipeDraft back. Never writes
// to the database (AD-2). The request's signal goes all the way to the page
// fetch and the model, so "Avbryt" stops both.
//
// A run can keep the local model busy for up to 115 s, so only the app itself
// may start one: JSON only (a cross-site form cannot send it without a
// preflight), the app's own origin, and a small body.

// The AI port's budget is 115 s in total (AD-9). For a link the page fetch
// (at most 10 s) comes first, so a slow site and a slow model together can
// reach this limit.
export const maxDuration = 120;

/** Largest request body: 12 000 characters of text, as UTF-8 and JSON, fit well within it. */
const maxBodyBytes = 64 * 1024;

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
  const parsed = importRequestSchema.safeParse(body);
  if (!parsed.success) return respond(fail("validation"));

  return respond(await importRecipe(parsed.data, { signal: request.signal }));
}

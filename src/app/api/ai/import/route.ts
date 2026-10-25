import { requireUserForRoute } from "@/features/auth/server";
import { importRequestSchema } from "@/features/recipes";
import { importRecipe } from "@/features/recipes/server";
import { fail, type ErrorCode, type Result } from "@/lib/errors";
import { env } from "@/server/env";

// Import of a recipe (AD-9): the client posts through src/lib/ai-client.ts and
// gets a RecipeDraft back. Never writes to the database (AD-2). The request's
// signal goes all the way to the model, so "Avbryt" stops the call.
//
// A run can keep the local model busy for up to 110 s, so only the app itself
// may start one: JSON only (a cross-site form cannot send it without a
// preflight), the app's own origin, and a small body.

// The AI port's budget is 110 s in total (AD-9).
export const maxDuration = 120;

/** Largest request body: 12 000 characters of text, as UTF-8 and JSON, fit well within it. */
const maxBodyBytes = 64 * 1024;

const statusFor: Partial<Record<ErrorCode, number>> = {
  unauthorized: 401,
  validation: 400,
  import_no_recipe: 422,
  ai_invalid: 502,
  ai_rejected: 502,
  ai_unavailable: 503,
  catalog_unavailable: 503,
};

function respond<T>(result: Result<T>, status?: number): Response {
  return Response.json(result, { status: status ?? (result.ok ? 200 : (statusFor[result.error.code] ?? 500)) });
}

/** True when the browser says the request comes from another site. Requests without the headers (scripts, tests) pass. */
function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(env.SITE_URL).origin) return true;
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

function isJson(request: Request): boolean {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return type === "application/json";
}

/** The body as text, or `null` when it is larger than `limit` bytes. Stops reading at the limit. */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (!isJson(request)) return respond(fail("validation"), 415);
  const text = await readCapped(request, maxBodyBytes);
  if (text === null) return respond(fail("validation"), 413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return respond(fail("validation"));
  }
  const parsed = importRequestSchema.safeParse(body);
  if (!parsed.success) return respond(fail("validation"));

  return respond(await importRecipe({ text: parsed.data.text }, { signal: request.signal }));
}

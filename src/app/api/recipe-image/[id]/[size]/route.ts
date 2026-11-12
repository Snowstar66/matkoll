import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { recipeImageSizes } from "@/features/recipes";
import { readRecipeImage } from "@/features/recipes/server";

// Receptbilden (AD-15 changed for recipe images, docs/beslutslogg.md): sends the
// stored picture of the signed-in household's recipe `id`, in the size `full`
// (the recipe's page) or `thumb` (the lists), for an <img> on the same site, so
// the session's cookies come along. The user is checked first; the row and the
// file are read with the session client, so RLS and the bucket's policies give
// only the household's own. There is no public or signed URL: a signed URL
// changes at every page load, so the browser could never reuse its copy, and
// a recipe's picture never changes once stored. This route answers with
// `private, max-age=86400`: the browser (not a shared cache) keeps it for a
// day, so a list of 50 thumbnails costs 50 requests once a day, not at every visit.
//
// A recipe that is gone, is another household's, has no copy of its own, or an
// id or size that is not valid, all get the same 404 without a body, so the
// answer never tells them apart; the page shows the picture from the recipe's
// image address, or a drawing, as before. Only the reason of a failure is
// logged, never the id or the path.

const cacheControl = "private, max-age=86400";
const baseHeaders = { "X-Content-Type-Options": "nosniff" };
const paramsSchema = z.object({ id: z.uuid(), size: z.enum(recipeImageSizes) });

function empty(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...baseHeaders, "Cache-Control": "private, no-store", ...headers } });
}

export async function GET(_request: Request, context: RouteContext<"/api/recipe-image/[id]/[size]">): Promise<Response> {
  try {
    const auth = await requireUserForRoute();
    if (auth.response) {
      const headers = new Headers(auth.response.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(auth.response.body, { status: auth.response.status, headers });
    }
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return empty(404);
    const image = await readRecipeImage(params.data.id, params.data.size);
    if (!image) return empty(404);
    return new Response(image.data, {
      headers: {
        ...baseHeaders,
        "Cache-Control": cacheControl,
        "Content-Type": image.mediaType,
        "Content-Length": String(image.data.size),
      },
    });
  } catch (error) {
    console.error("recipe_image_unavailable", { reason: error instanceof Error ? error.name : typeof error });
    return empty(500);
  }
}

import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { recipeImageSizes } from "@/features/recipes";
import { readStarterImage } from "@/features/recipes/server";

// Startrecept: the stored picture of a pack recipe (the app owner's own recipe in the pack,
// 20261112120000_starter_recipes.sql), for the picker and its preview, in the size `full` or
// `thumb`. Any signed-in member may see it, as the pack is offered to every household; the file is
// read with the session client, whose policy lets a member read a pack recipe's files and nothing
// else of another household. As /api/recipe-image: `private, max-age=86400`, and the same 404
// without a body for an item that is not in the pack, has no stored picture, or an id or size that
// is not valid. Only the reason of a failure is logged.

const baseHeaders = { "X-Content-Type-Options": "nosniff" };
const paramsSchema = z.object({ item: z.uuid(), size: z.enum(recipeImageSizes) });

function empty(status: number): Response {
  return new Response(null, { status, headers: { ...baseHeaders, "Cache-Control": "private, no-store" } });
}

export async function GET(_request: Request, context: RouteContext<"/api/starter-image/[item]/[size]">): Promise<Response> {
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
    const image = await readStarterImage(params.data.item, params.data.size);
    if (!image) return empty(404);
    return new Response(image.data, {
      headers: {
        ...baseHeaders,
        // Shorter than a recipe's own picture: the owner may change the pack recipe's picture.
        "Cache-Control": "private, max-age=3600",
        "Content-Type": image.mediaType,
        "Content-Length": String(image.data.size),
      },
    });
  } catch (error) {
    console.error("starter_image_unavailable", { reason: error instanceof Error ? error.name : typeof error });
    return empty(500);
  }
}

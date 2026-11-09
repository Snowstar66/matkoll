import { requireUserForRoute } from "@/features/auth/server";
import { normalizeMenu, type Menu } from "@/features/menu-advisor";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { maxPlacePhotoSide } from "@/lib/images";
import { isCrossSite, mediaTypeOf, readImageForm, respond } from "../../ai/route-support";

// Menyrådgivare: a photo of a restaurant menu, read by the AI port's readMenu (AD-9). multipart/form-data with the
// resized photo in the field `image` (one photo for now: readImageForm reads one; the port takes up to three) and
// optionally the text field `quality` ("standard" or "careful"). The answer is the menu after normalizeMenu (the
// currency symbol on the menu wins over the model's currency): `{ menu, quality, escalated }`. The call goes through
// getAiServiceForUser, so the household's daily cap is asked first (`ai_cap_reached`) and the usage is counted.
// The photo is only held in memory: never stored, never logged.

// A reading of a large menu can take a standard and a careful run after each other.
export const maxDuration = 180;

/** The time the model gets; within maxDuration. */
const readDeadlineMs = 165_000;

type MenuReadAnswer = { menu: Menu; quality: "standard" | "careful"; escalated: boolean };

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  // Small print needs more pixels than a list: the same side as a photo of a place.
  const form = await readImageForm(request, ["quality"], { maxSide: maxPlacePhotoSide });
  if (!form.ok) return form.response;
  const { quality } = form.fields;
  if (quality !== null && quality !== "standard" && quality !== "careful") return respond(fail("validation"), 400);

  let result: Result<MenuReadAnswer>;
  try {
    const ai = await getAiServiceForUser();
    const read = await ai.readMenu({ images: [form.image], quality: quality ?? undefined }, request.signal, {
      deadline: Date.now() + readDeadlineMs,
    });
    result = read.ok ? ok({ menu: normalizeMenu(read.data.menu), quality: read.data.quality, escalated: read.data.escalated }) : read;
  } catch (error) {
    console.error("menu_read_failed", { reason: error instanceof Error ? error.name : "unknown" });
    result = fail("ai_unavailable");
  }
  return respond(result);
}

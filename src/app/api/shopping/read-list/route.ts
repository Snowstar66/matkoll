import { requireUserForRoute } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, type Result } from "@/lib/errors";
import { isCrossSite, mediaTypeOf, readImageForm, respond } from "../../ai/route-support";

// Fota en lista (Inköpslista, Lägg till vara): a photo of a handwritten note or a screenshot of a list, read by the
// AI port's readShoppingList (AD-9). multipart/form-data with the resized photo in the field `image` (at most 1600 px
// and 1.5 MB, AD-15); the answer is the items, `{ items: [{ name, amount, unit }] }`, possibly none. The call goes
// through getAiServiceForUser, so the household's AI choice applies, the daily cap is asked first
// (`ai_cap_reached`) and the usage is counted. A Route Handler rather than a Server Action: a read never queues the
// page's other actions behind it, and it can be stopped ("Avbryt"). The photo is only held in memory: never stored,
// never logged.

export const maxDuration = 120;

/** The time the model gets; well within maxDuration. */
const readDeadlineMs = 100_000;

type Items = { items: { name: string; amount: number | null; unit: string | null }[] };

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  const form = await readImageForm(request);
  if (!form.ok) return form.response;

  let result: Result<Items>;
  try {
    const ai = await getAiServiceForUser();
    result = await ai.readShoppingList({ image: form.image }, request.signal, { deadline: Date.now() + readDeadlineMs });
  } catch (error) {
    console.error("shopping_list_read_failed", { reason: error instanceof Error ? error.name : "unknown" });
    result = fail("ai_unavailable");
  }
  return respond(result);
}

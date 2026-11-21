import "server-only";
import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { cleanModelText, cutCodePoints } from "@/lib/suggest-input";
import { cropAround } from "@/server/images";
import { ThingsDataError } from "../data/client";
import { downloadCardFile, loadCardIn } from "../data/photos";
import { loadThingForWorthIn, saveWorthDetailIn } from "../data/worth";
import { formatWorthDetail } from "../domain/thing-worth";

// Förklara närmare (Värt en titt): a föremål with a tip asks for a fuller explanation, why it was flagged, what it
// could be and what is worth checking, with one short AI call. The photo goes cropped round the föremål when it has a
// box, else whole, with its name and the tip. The answer is kept on the föremål (thing_item.worth_detail), so it is
// asked for once: a second tap, or another device, reads it. A call that does not go (the AI is out of reach, or
// refuses) saves nothing, and the next tap tries again. The Route Handler POST /api/things/worth-detail calls it
// (maxDuration 60 s), not a Server Action, so the wait never holds up the page's other actions. The AI choice of
// Inställningar applies and the call is counted. Which föremål may ask is decided by the tip it has; the Tillval
// switch lives on the device and only shows the button. The photo is only in this request's memory; only codes are
// logged, never a name, a tip or a path.

const deadlineMs = 45_000;

/** The most characters of a name and a tip sent to the model, as thing_item holds them. */
const maxNameChars = 80;
const maxTipChars = 200;

/** The text on one line and at most `max` UTF-16 units, as the port takes it (never ending in a space). */
function fitted(text: string, max: number): string {
  let fit = cleanModelText(text);
  while (fit.length > max) fit = cleanModelText(cutCodePoints(fit, Array.from(fit).length - 1));
  return fit;
}

/**
 * The explanation of the user's föremål `thingId`: the kept one, or the answer of a new call (kept). Fails with
 * `unauthorized`, `validation`, `things_item_gone` (gone, not the user's, no card, or no tip), `things_card_gone`
 * (its photo is gone), `things_unavailable`, or the AI port's `ai_unavailable`, `ai_rejected`, `ai_invalid` and
 * `ai_cap_reached` (nothing is kept for those).
 */
export async function explainThingWorth(thingId: string): Promise<Result<{ detail: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!z.uuid().safeParse(thingId).success) return fail("validation");

  const db = await createClient();
  let image: { data: Uint8Array; mediaType: string };
  let thing: NonNullable<Awaited<ReturnType<typeof loadThingForWorthIn>>>;
  try {
    const found = await loadThingForWorthIn(db, thingId);
    if (!found) return fail("things_item_gone");
    thing = found;
    if (thing.worth.detail) return ok({ detail: thing.worth.detail });
    const card = await loadCardIn(db, thing.photoId);
    if (!card) return fail("things_item_gone");
    const file = await downloadCardFile(db, card.objectPath);
    if (!file) return fail("things_card_gone");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const cropped = thing.box ? await cropAround(bytes, thing.box) : null;
    image = cropped ?? { data: bytes, mediaType: card.mediaType };
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }

  const name = fitted(thing.name, maxNameChars);
  const tip = fitted(thing.worth.why, maxTipChars);
  if (name === "" || tip === "") return fail("validation");
  const ai = await getAiServiceForUser();
  const explained = await ai.explainWorth({ image, name, tip, confidence: thing.worth.confidence }, AbortSignal.timeout(deadlineMs + 5_000), {
    deadline: Date.now() + deadlineMs,
  });
  if (!explained.ok) return explained;

  const text = formatWorthDetail({ why: explained.data.darfor, couldBe: explained.data.kan_vara, checks: explained.data.undersok, search: explained.data.sokfras });
  // An answer with nothing in it is the model's failure, not a kept empty explanation.
  if (!text) return fail("ai_invalid");
  try {
    await saveWorthDetailIn(db, thing.id, text);
  } catch (error) {
    // The explanation is shown anyway; the next tap asks again.
    console.error("things_worth_detail_save_failed", { reason: error instanceof ThingsDataError ? error.detail : "unknown" });
  }
  console.info("things_worth_explained", { cropped: thing.box !== null });
  return ok({ detail: text });
}

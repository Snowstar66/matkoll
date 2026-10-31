"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { cleanModelText, cutCodePoints } from "@/lib/suggest-input";
import type { ThingBox } from "@/lib/thing-box";
import { ThingsDataError } from "../data/client";
import { loadThingForLookupIn, saveThingBoxIn } from "../data/card-view";
import { downloadCardFile, loadCardIn } from "../data/photos";

// Peka ut föremålet (Story 18.7, FR-24, AD-9): a card read before the boxes
// came has none, so the first time one of its föremål is marked, one small AI
// call with the card's photo and the föremål's name looks for it. The answer is
// saved on the föremål: its box, or that the model did not see it (box_missed),
// so the same föremål never costs a second call. A call that does not go
// (the AI is out of reach) saves nothing, and the next tap tries again. A
// Server Action on the card's page (maxDuration 60 s): the model gets at most
// 30 s. The AI choice of Inställningar applies and the call is counted (Story
// 17.6). The photo is only in this request's memory; only codes and whether it
// was found are logged, never a name, a box or a path.

const lookupDeadlineMs = 30_000;

/** The most characters of a name and a "where" sent to the model, as thing_item holds them. */
const maxNameChars = 80;
const maxWhereChars = 120;

/** The text on one line and at most `max` UTF-16 units, as the port takes it (never ending in a space). */
function fitted(text: string, max: number): string {
  let fit = cleanModelText(text);
  while (fit.length > max) fit = cleanModelText(cutCodePoints(fit, Array.from(fit).length - 1));
  return fit;
}

/**
 * The box of the user's föremål `thingId` on its card: the saved one, `null`
 * when an earlier lookup found nothing, or the answer of a new lookup (saved).
 * Fails with `unauthorized`, `validation`, `things_item_gone` (gone, not the
 * user's, or written into a box), `things_card_gone` (its photo is gone),
 * `things_unavailable`, or the AI port's `ai_unavailable`, `ai_rejected` and
 * `ai_invalid` (nothing is saved for those).
 */
export async function locateThingOnCard(thingId: string): Promise<Result<{ box: ThingBox | null }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!z.uuid().safeParse(thingId).success) return fail("validation");

  const db = await createClient();
  let image: { data: Uint8Array; mediaType: string };
  let thing: NonNullable<Awaited<ReturnType<typeof loadThingForLookupIn>>>;
  try {
    const found = await loadThingForLookupIn(db, thingId);
    if (!found) return fail("things_item_gone");
    thing = found;
    if (thing.box || thing.boxMissed) return ok({ box: thing.box });
    const card = await loadCardIn(db, thing.photoId);
    if (!card) return fail("things_item_gone");
    const file = await downloadCardFile(db, card.objectPath);
    if (!file) return fail("things_card_gone");
    image = { data: new Uint8Array(await file.arrayBuffer()), mediaType: card.mediaType };
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }

  const name = fitted(thing.name, maxNameChars);
  const where = thing.whereHint ? fitted(thing.whereHint, maxWhereChars) || null : null;
  if (name === "") return fail("validation");
  const ai = await getAiServiceForUser();
  const located = await ai.locateThing({ image, name, where }, AbortSignal.timeout(lookupDeadlineMs + 5_000), {
    deadline: Date.now() + lookupDeadlineMs,
  });
  if (!located.ok) return located;

  try {
    await saveThingBoxIn(db, thing.id, located.data.box);
  } catch (error) {
    // The box is shown anyway; the next visit looks again.
    console.error("things_box_save_failed", { reason: error instanceof ThingsDataError ? error.detail : "unknown" });
  }
  revalidateFor("thing_item");
  console.info("things_box_looked_up", { found: located.data.box !== null });
  return ok({ box: located.data.box });
}

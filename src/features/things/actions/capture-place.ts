"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { ensurePlaceIn } from "../data/places";
import { captureInputSchema, emptyCaptureRoomText, type CaptureInput } from "../domain/capture";
import { nameTooLongText, placeLimitText } from "../domain/thing-place";

/**
 * The place a card is taken in (Story 18.11): the room alone ("Hela rummet"), a
 * part of it or a box, found when it is there and made when it is not. The room
 * keeps the spelling it has already. Returns the place's id, for the photos to
 * be posted to. A boende that is gone is `things_place_gone`; too many places
 * is `things_place_limit`. Logs only the reason, never a name.
 */
export async function ensureCapturePlace(input: CaptureInput): Promise<Result<{ placeId: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = captureInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (String(issue?.path[0]) === "room") return fail("validation", { room: issue?.message === "too long" ? nameTooLongText : emptyCaptureRoomText });
    if (String(issue?.path[0]) === "part") return fail("validation", { part: nameTooLongText });
    return fail("validation");
  }
  const { siteId, room, part } = parsed.data;
  const box = parsed.data.box && part !== null;

  try {
    const place = await ensurePlaceIn(await createClient(), { siteId, room, part }, box);
    if (place.kind === "limit") return fail("things_place_limit", { room: placeLimitText });
    if (place.kind === "site_gone") return fail("things_place_gone");
    if (place.kind === "failed") return fail("things_place_failed");
    if (place.kind === "made") revalidateFor("thing_place");
    return ok({ placeId: place.id });
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_place_failed", { reason: error.detail });
    return fail("things_place_failed");
  }
}

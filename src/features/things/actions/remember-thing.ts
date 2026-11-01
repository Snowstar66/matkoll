"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { noteCountIn, rememberThingIn } from "../data/noted";
import { ensurePlaceIn } from "../data/places";
import { emptyNameText, nameTooLongText as thingNameTooLongText } from "../domain/thing-edit";
import { notedTitle, rememberInputSchema, type RememberInput, type Remembered } from "../domain/thing-noted";
import { emptyRoomText, nameTooLongText as placeNameTooLongText, normalizePlaceName, placeLimitText } from "../domain/thing-place";

/**
 * "Kom ihåg" (Story 18.19): saves a thing Pontus wrote in with where it is, in
 * the boende `siteId`, without a card or photo. The room and the part are found
 * when they are there and made when they are not (a part, never a box). With
 * `replaces` the noted thing of the same name moves: the old row goes in the
 * same transaction. With `count` (Story 18.24) the föremål is counted from the start. Fails with `validation` (the text in `fields.name`,
 * `fields.room` or `fields.part`), `things_place_limit`, `things_place_gone`,
 * `things_noted_full` or `things_noted_failed`. Logs only the reason, never a name.
 */
export async function rememberThing(input: RememberInput): Promise<Result<Remembered>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = rememberInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0]);
    const tooLong = issue?.message === "too long";
    if (field === "name") return fail("validation", { name: tooLong ? thingNameTooLongText : emptyNameText });
    if (field === "room") return fail("validation", { room: tooLong ? placeNameTooLongText : emptyRoomText });
    if (field === "part") return fail("validation", { part: placeNameTooLongText });
    return fail("validation");
  }
  const { siteId, name, room, part, category, replaces, count } = parsed.data;

  try {
    const db = await createClient();
    const place = await ensurePlaceIn(db, { siteId, room, part });
    if (place.kind === "limit") return fail("things_place_limit", { room: placeLimitText });
    if (place.kind === "site_gone") return fail("things_place_gone");
    if (place.kind === "failed") return fail("things_noted_failed");
    if (place.kind === "made") revalidateFor("thing_place");
    const saved = await rememberThingIn(db, { placeId: place.id, name, category, replaces });
    if (saved.kind === "gone") return fail("things_place_gone");
    if (saved.kind === "full") return fail("things_noted_full");
    // Story 18.24: a count from "Antal (valfritt)" starts the history ("4 · Inskrivet"). The föremål is saved
    // either way: a count that fails is only missing, and can be set in its sheet.
    let counted = false;
    if (count !== null) {
      try {
        await noteCountIn(db, saved.id, count);
        counted = true;
      } catch (error) {
        if (!(error instanceof ThingsDataError)) throw error;
        console.error("things_noted_count_failed", { reason: error.detail });
      }
    }
    revalidateFor("thing_item");
    console.info("things_noted", { madePlace: place.kind === "made", moved: replaces !== null, counted });
    return ok({
      id: saved.id,
      title: notedTitle({ room, part }),
      href: `/prylar/rum/${siteId}/${encodeURIComponent(normalizePlaceName(room))}`,
      notedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_noted_failed", { reason: error.detail });
    return fail("things_noted_failed");
  }
}

"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { insertPlaceIn, loadPlaceIn } from "../data/places";
import { boxInputSchema, boxTakenText, emptyBoxText, nameTooLongText, placeLimitText, type BoxInput } from "../domain/thing-place";

/**
 * "Lägg till" in the sheet Lägg till låda (Story 18.5): a box named `name` in
 * the room of the place `placeId`. The box is a place of its own (its own
 * card, photographed like any place) whose part is the box's name. A box that
 * is a box already cannot hold a box. The same name in the room is
 * `things_place_taken` (text in `fields.name`); a place that is gone is
 * `things_place_gone`. Returns the box's id, so the page can open it. Logs only
 * the reason, never a name.
 */
export async function createThingBox(input: BoxInput): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = boxInputSchema.safeParse(input);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "name");
    if (field === "placeId") return fail("validation");
    return fail("validation", { name: parsed.error.issues[0]?.message === "too long" ? nameTooLongText : emptyBoxText });
  }

  try {
    const db = await createClient();
    const parent = await loadPlaceIn(db, parsed.data.placeId);
    if (!parent || parent.isBox) return fail("things_place_gone");
    const saved = await insertPlaceIn(db, { siteId: parent.siteId, room: parent.room, part: parsed.data.name }, true);
    switch (saved.kind) {
      case "saved":
        revalidateFor("thing_place");
        return ok({ id: saved.id });
      case "taken":
        return fail("things_place_taken", { name: boxTakenText });
      case "limit":
        return fail("things_place_limit", { name: placeLimitText });
      case "site_gone":
        return fail("things_place_gone");
    }
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_place_failed", { reason: error.detail });
    return fail("things_place_failed");
  }
}

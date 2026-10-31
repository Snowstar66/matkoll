"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { insertPlaceIn } from "../data/places";
import { emptyRoomText, nameTooLongText, placeInputSchema, placeLimitText, placeTakenText, type PlaceInput } from "../domain/thing-place";

/**
 * "Skapa" in the sheet Ny plats (Story 18.1): a room and an optional part in
 * the boende the page showed (`siteId`, never the one selected now). The same
 * room and part in another spelling are `things_place_taken`, with the text in
 * `fields.room`; a boende that is gone is `things_place_gone`. Returns the new
 * place's id, so the page can open it. Logs only the reason, never a name.
 */
export async function createThingPlace(input: PlaceInput): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = placeInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "room");
      if (field === "siteId") return fail("validation");
      fields[field] = issue.message === "too long" ? nameTooLongText : emptyRoomText;
    }
    return fail("validation", fields);
  }

  try {
    const saved = await insertPlaceIn(await createClient(), parsed.data);
    switch (saved.kind) {
      case "saved":
        revalidateFor("thing_place");
        return ok({ id: saved.id });
      case "taken":
        return fail("things_place_taken", { room: placeTakenText });
      case "limit":
        return fail("things_place_limit", { room: placeLimitText });
      case "site_gone":
        return fail("things_place_gone");
    }
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_place_failed", { reason: error.detail });
    return fail("things_place_failed");
  }
}

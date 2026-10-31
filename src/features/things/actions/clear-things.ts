"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { clearThingsIn } from "../data/clear";
import { loadSiteCardFilesIn, removeCardFiles } from "../data/photos";
import { loadRoomIn } from "../data/rooms";
import { clearInputSchema, clearSiteWord, matchesClearWord, type ClearCounts } from "../domain/thing-clear";
import { sweepCardFilesIn } from "./sweep-card-files";

// "Rensa rummet" and "Rensa förrådet" (Story 18.15): everything of Förråd in a
// room, or in a boende, is removed for the signed-in user only. The rows go in
// one database function (clear_things, under the user's lock); the files go
// with the Storage API (AD-26), once more on a failure, and a file that is left
// anyway has no row, so the sweep of the next card takes it. Matvaror is never
// touched. Only reasons and counts are logged, never a name or a path.

type ClearInput = { siteId: string; roomKey?: string; confirm: string };

async function clear(input: ClearInput): Promise<Result<ClearCounts>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = clearInputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { siteId, roomKey, confirm } = parsed.data;
  const db = await createClient();

  // The typed word is checked here too, not only in the sheet: the room's real name (RLS-scoped), or RENSA.
  // Nothing is removed unless it matches.
  let word = clearSiteWord;
  if (roomKey !== undefined) {
    try {
      const room = await loadRoomIn(db, siteId, roomKey);
      if (!room) return fail("things_place_gone");
      word = room.room;
    } catch (error) {
      if (!(error instanceof ThingsDataError)) throw error;
      console.error("things_clear_failed", { reason: error.detail });
      return fail("things_clear_failed");
    }
  }
  if (!matchesClearWord(confirm, word)) return fail("validation", { confirm: "Skriv ordet för att bekräfta." });

  // The files are listed first, to take those without a row too (the rows are gone after the call).
  let listed: string[] = [];
  try {
    listed = await loadSiteCardFilesIn(db, user.data.id, siteId, roomKey);
  } catch (error) {
    // The function's own list of removed cards is still used; the sweep takes the rest.
    console.error("things_photo_remove_failed", { reason: error instanceof ThingsDataError ? error.detail : "list_threw" });
  }

  let removed;
  try {
    removed = await clearThingsIn(db, siteId, roomKey);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_clear_failed", { reason: error.detail });
    return fail("things_clear_failed");
  }
  if (removed.kind === "gone") {
    revalidateFor("thing_place");
    return fail("things_place_gone");
  }

  // Only the user's own folder is touched, as the bucket's policies say as well.
  const paths = [...new Set([...listed, ...removed.paths])].filter((path) => path.startsWith(`${user.data.id}/`));
  const { failed } = await removeCardFiles(db, paths);
  if (failed !== null) console.error("things_photo_remove_failed", { reason: failed });
  else void sweepCardFilesIn(db, user.data.id).catch(() => {});
  revalidateFor("thing_place");
  revalidateFor("thing_photo");
  revalidateFor("thing_item");
  console.info("things_cleared", { things: removed.counts.things, cards: removed.counts.cards, boxes: removed.counts.boxes, files: paths.length });
  return ok(removed.counts);
}

/** "Rensa rummet": removes the room `roomKey` of the boende `siteId` with its cards, files, things, boxes and places. */
export async function clearThingRoom(input: { siteId: string; roomKey: string; confirm: string }): Promise<Result<ClearCounts>> {
  if (typeof input?.roomKey !== "string") return fail("validation");
  return clear({ siteId: input.siteId, roomKey: input.roomKey, confirm: input.confirm });
}

/** "Rensa förrådet": removes everything of Förråd in the boende `siteId`. */
export async function clearThingSite(input: { siteId: string; confirm: string }): Promise<Result<ClearCounts>> {
  return clear({ siteId: input?.siteId, confirm: input?.confirm });
}

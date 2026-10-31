"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { copyCardFile, loadPlaceKindIn, loadRoomMergeMovesIn, removePlaceRowsIn, renamePartRowIn, renameRoomRowsIn } from "../data/place-edit";
import { removeCardFiles } from "../data/photos";
import { loadRoomsIn } from "../data/rooms";
import { boxKey, cleanPlaceName, nameTooLongText, normalizePlaceName } from "../domain/thing-place";
import {
  emptyNewNameText,
  placeNameTakenText,
  removePlaceInputSchema,
  renamePlaceInputSchema,
  renameRoomInputSchema,
  type PlaceCounts,
  type RenamedRoom,
  type RenamePlaceInput,
  type RenameRoomInput,
} from "../domain/thing-place-edit";
import { sweepCardFilesIn } from "./sweep-card-files";

// Rätta rum och delar (Story 18.16). Everything is for the signed-in user only
// (RLS and the functions' own checks). A room's rename and a place's removal run
// in one database function each (under the user's lock); the files go with the
// Storage API (AD-26): a merge copies the moved cards' files to their new paths
// first, so a failure leaves nothing broken, and removes the old ones after.
// Only reasons and counts are logged, never a name or a path.

function nameProblem(message: string | undefined, field: string) {
  return fail("validation", { [field]: message === "too long" ? nameTooLongText : emptyNewNameText });
}

/**
 * "Byt namn på rummet": the room `roomKey` of the boende gets the name `name`.
 * When another room has the name, nothing is changed and `exists` is answered
 * until the user says yes (`merge`): the rooms are then merged, a part that both
 * have becoming one place with all the cards.
 */
export async function renameThingRoom(input: RenameRoomInput): Promise<Result<RenamedRoom>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = renameRoomInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return String(issue?.path[0]) === "name" ? nameProblem(issue?.message, "name") : fail("validation");
  }
  const { siteId, roomKey, name, merge } = parsed.data;
  const newKey = normalizePlaceName(name);
  const db = await createClient();

  try {
    const rooms = await loadRoomsIn(db, siteId);
    if (!rooms.some((room) => room.key === roomKey)) return fail("things_place_gone");
    const other = newKey === roomKey ? undefined : rooms.find((room) => room.key === newKey);
    if (other && !merge) return ok({ kind: "exists", room: other.room });

    // The files of cards that change places go first (a copy), the rows after, the old files last.
    const moves = other ? await loadRoomMergeMovesIn(db, siteId, roomKey, newKey) : [];
    const copied: string[] = [];
    for (const move of moves) {
      const failed = await copyCardFile(db, move.from, move.to);
      if (failed !== null) {
        console.error("things_rename_failed", { reason: failed });
        await removeCardFiles(db, copied);
        return fail("things_rename_failed");
      }
      copied.push(move.to);
    }

    const saved = await renameRoomRowsIn(db, { siteId, roomKey, name, newKey });
    if (saved.kind === "gone") {
      await removeCardFiles(db, copied);
      revalidateFor("thing_place");
      return fail("things_place_gone");
    }
    if (moves.length > 0) {
      const { failed } = await removeCardFiles(db, moves.map((move) => move.from));
      if (failed !== null) console.error("things_photo_remove_failed", { reason: failed });
      else void sweepCardFilesIn(db, user.data.id).catch(() => {});
    }
    revalidateFor("thing_place");
    revalidateFor("thing_photo");
    revalidateFor("thing_item");
    console.info("things_room_renamed", { merged: saved.merged, files: moves.length });
    return ok({ kind: "renamed", key: newKey, room: other?.room ?? name, merged: saved.merged > 0 || other !== undefined });
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_rename_failed", { reason: error.detail });
    return fail("things_rename_failed");
  }
}

/** "Byt namn" on a part or a box: the place keeps its cards and things; its name is the only change. */
export async function renameThingPlace(input: RenamePlaceInput): Promise<Result<{ part: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = renamePlaceInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return String(issue?.path[0]) === "name" ? nameProblem(issue?.message, "name") : fail("validation");
  }
  const { placeId } = parsed.data;
  const name = cleanPlaceName(parsed.data.name);
  try {
    const db = await createClient();
    const place = await loadPlaceKindIn(db, placeId);
    // The whole room ("Hela rummet") has no name of its own.
    if (!place || place.part === null) return fail("things_place_gone");
    const saved = await renamePartRowIn(db, placeId, name, place.kind === "box" ? boxKey(name) : normalizePlaceName(name));
    if (saved === "taken") return fail("validation", { name: placeNameTakenText });
    if (saved === "gone") return fail("things_place_gone");
    revalidateFor("thing_place");
    return ok({ part: name });
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_rename_failed", { reason: error.detail });
    return fail("things_rename_failed");
  }
}

/**
 * "Ta bort" on a part or a box: the place is removed with its cards, files and
 * things. Gives back what went and whether the room still has places (when it has
 * none the room is gone with it).
 */
export async function removeThingPlace(input: { placeId: string }): Promise<Result<{ counts: PlaceCounts; roomLeft: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = removePlaceInputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const db = await createClient();
  try {
    const place = await loadPlaceKindIn(db, parsed.data.placeId);
    // The whole room is removed with "Rensa rummet", not here.
    if (!place || place.part === null) return fail("things_place_gone");
    const removed = await removePlaceRowsIn(db, parsed.data.placeId);
    if (removed.kind === "gone") {
      revalidateFor("thing_place");
      return fail("things_place_gone");
    }
    // Only the user's own folder is touched, as the bucket's policies say as well.
    const paths = removed.paths.filter((path) => path.startsWith(`${user.data.id}/`));
    const { failed } = await removeCardFiles(db, paths);
    if (failed !== null) console.error("things_photo_remove_failed", { reason: failed });
    else void sweepCardFilesIn(db, user.data.id).catch(() => {});
    revalidateFor("thing_place");
    revalidateFor("thing_photo");
    revalidateFor("thing_item");
    console.info("things_place_removed", { things: removed.counts.things, cards: removed.counts.cards, files: paths.length });
    return ok({ counts: removed.counts, roomLeft: removed.roomLeft > 0 });
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_place_remove_failed", { reason: error.detail });
    return fail("things_place_remove_failed");
  }
}

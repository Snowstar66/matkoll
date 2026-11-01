"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { removeEmptyRoomIn, restoreRoomIn } from "../data/room-remove";
import { removeRoomInputSchema, roomSnapshotSchema, type RoomSnapshot } from "../domain/thing-clear";

// "Ta bort rummet" with "Ångra" (Pontus 1 Nov), for an empty room only: the
// room's places go at once and come back with the same ids. There are no
// cards, so no files. Only reasons are logged, never a name.

/**
 * Removes the empty room `roomKey` of the boende `siteId` and returns it as it
 * was. Fails with `unauthorized`, `validation`, `things_place_gone`,
 * `things_room_not_empty` (it has a card or a föremål: nothing is removed) or
 * `things_place_remove_failed`.
 */
export async function removeEmptyThingRoom(input: { siteId: string; roomKey: string }): Promise<Result<RoomSnapshot>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = removeRoomInputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  try {
    const removed = await removeEmptyRoomIn(await createClient(), parsed.data.siteId, parsed.data.roomKey);
    if (removed.kind === "not_empty") return fail("things_room_not_empty");
    revalidateFor("thing_place");
    return removed.kind === "gone" ? fail("things_place_gone") : ok(removed.snapshot);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_place_remove_failed", { reason: error.detail });
    return fail("things_place_remove_failed");
  }
}

/**
 * "Ångra": the room is back with its places. Fails with `validation`,
 * `things_room_taken` (a room of that name was made since),
 * `things_place_gone` (the boende went) or `things_restore_failed`.
 */
export async function restoreThingRoom(snapshot: RoomSnapshot): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = roomSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return fail("validation");
  try {
    const restored = await restoreRoomIn(await createClient(), parsed.data);
    revalidateFor("thing_place");
    if (restored === "taken") return fail("things_room_taken");
    if (restored === "site_gone") return fail("things_place_gone");
    return ok(null);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_restore_failed", { reason: error.detail });
    return fail("things_restore_failed");
  }
}

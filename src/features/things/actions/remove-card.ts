"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { ThingsDataError } from "../data/client";
import { removeCardFileIfOrphan, removeCardIn, restoreCardIn } from "../data/photos";
import { cardFilePathSchema, cardSnapshotSchema, type CardSnapshot } from "../domain/thing-edit";

// "Ta bort kortet" with "Ångra" (Story 18.3, AD-20, AD-26). Three steps,
// because the file cannot be put back once it is removed:
//   1. removeThingCard deletes the card's row (its things go with it) and
//      gives back a snapshot; the file stays.
//   2. "Ångra", within a few seconds: restoreThingCard puts the rows back with
//      the same ids, if the file is still there.
//   3. When the time is out without "Ångra": finishCardRemoval removes the
//      file (only if no card has it, so a restored card keeps it). If that
//      never runs (the tab was closed), sweepCardFilesIn takes the file with
//      the next card taken.
// Only reasons are logged, never a name or a path.

const idSchema = z.uuid();

/**
 * Deletes the finished card `id` with its things and returns it as it was. Its
 * file is kept for "Ångra". Fails with `unauthorized`, `validation`,
 * `things_card_gone` (not the user's, gone or not finished) or
 * `things_card_remove_failed`.
 */
export async function removeThingCard(id: string): Promise<Result<CardSnapshot>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");
  try {
    const removed = await removeCardIn(await createClient(), parsed.data);
    revalidateFor("thing_photo");
    return removed ? ok(removed.snapshot) : fail("things_card_gone");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_card_remove_failed", { reason: error.detail });
    return fail("things_card_remove_failed");
  }
}

/**
 * "Ångra": the card and its things are back with the same ids. Fails with
 * `things_restore_file_gone` (the file went), `things_place_gone`,
 * `things_restore_failed` or `validation`.
 */
export async function restoreThingCard(snapshot: CardSnapshot): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = cardSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return fail("validation");
  try {
    const restored = await restoreCardIn(await createClient(), parsed.data);
    if (restored !== "restored") {
      revalidateFor("thing_photo");
      return fail(restored === "file_gone" ? "things_restore_file_gone" : "things_place_gone");
    }
    revalidateFor("thing_photo");
    return ok(null);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_restore_failed", { reason: error.detail });
    return fail("things_restore_failed");
  }
}

/** The undo time is out: removes the file of a removed card, if no card has it. Never fails to the caller. */
export async function finishCardRemoval(path: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = cardFilePathSchema.safeParse(path);
  // The folder is the user's own, as the bucket's policies say; a path of another folder is not touched.
  if (!parsed.success || !parsed.data.startsWith(`${user.data.id}/`)) return fail("validation");
  await removeCardFileIfOrphan(await createClient(), parsed.data);
  return ok(null);
}

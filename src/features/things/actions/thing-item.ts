"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { removeItemIn, renameItemIn, restoreItemIn } from "../data/items";
import { emptyNameText, nameTooLongText, renameInputSchema, thingSnapshotSchema, type RenameInput, type ThingSnapshot } from "../domain/thing-edit";

// One thing the AI got wrong (Story 18.3): rename it, or remove just it, with
// "Ångra". The card is never changed: no date, no other thing, no file.

const idSchema = z.uuid();

/** "Spara" in the sheet of a thing: a new name. Fails with `validation` (the text in `fields.name`), `things_item_gone` or `things_item_failed`. */
export async function renameThing(input: RenameInput): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = renameInputSchema.safeParse(input);
  if (!parsed.success) {
    const idIssue = parsed.error.issues.some((issue) => issue.path[0] === "id");
    if (idIssue) return fail("validation");
    return fail("validation", { name: parsed.error.issues[0]?.message === "too long" ? nameTooLongText : emptyNameText });
  }
  try {
    const renamed = await renameItemIn(await createClient(), parsed.data.id, parsed.data.name);
    revalidateFor("thing_item");
    return renamed ? ok(null) : fail("things_item_gone");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_item_failed", { reason: error.detail });
    return fail("things_item_failed");
  }
}

/** "Ta bort pryl": deletes the thing and gives it back as it was, for "Ångra". */
export async function removeThing(id: string): Promise<Result<ThingSnapshot>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");
  try {
    const removed = await removeItemIn(await createClient(), parsed.data);
    revalidateFor("thing_item");
    return removed ? ok(removed) : fail("things_item_gone");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_item_failed", { reason: error.detail });
    return fail("things_item_failed");
  }
}

/** "Ångra": the thing is back with the same id. Fails with `things_item_gone` when its card is gone. */
export async function restoreThing(snapshot: ThingSnapshot): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = thingSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return fail("validation");
  try {
    const restored = await restoreItemIn(await createClient(), parsed.data);
    revalidateFor("thing_item");
    return restored === "restored" ? ok(null) : fail("things_item_gone");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_restore_failed", { reason: error.detail });
    return fail("things_restore_failed");
  }
}

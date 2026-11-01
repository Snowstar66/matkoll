"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { getOthers } from "@/features/household/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "../data/client";
import { changeQuantityIn, loadCountIn, restoreCountIn, setQuantityIn, stopCountIn, undoChangeIn } from "../data/count";
import { changeCountInputSchema, countSnapshotSchema, setCountInputSchema, type Changed, type CountSnapshot, type ThingCount } from "../domain/thing-count";

// Ta och fyll på (Story 18.23): Ta and Fyll på on a hit row or in a föremål's
// sheet, Ångra, Räkna and Rätta antalet, Sluta räkna, and the sheet's count
// and history. Each change is saved at once, by one database function that
// changes the count and logs it together, as the signed-in user (RLS). Only
// codes and counts are logged, never a name.

const idSchema = z.uuid();

function failed(error: unknown): Result<never> {
  if (!(error instanceof ThingsDataError)) throw error;
  console.error("things_count_failed", { reason: error.detail });
  return fail("things_count_failed");
}

/** Ta (delta < 0) or Fyll på (delta > 0): the new count and the change's id for Ångra. Fails with `validation`, `things_item_gone` or `things_count_failed`. */
export async function changeThingCount(input: { itemId: string; delta: number }): Promise<Result<Changed>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = changeCountInputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  try {
    const changed = await changeQuantityIn(await createClient(), parsed.data.itemId, parsed.data.delta);
    revalidateFor("thing_item");
    if (changed === "gone") return fail("things_item_gone");
    if (changed === "not_counted") return fail("things_count_failed");
    console.info("things_count_changed", { delta: parsed.data.delta, quantity: changed.quantity });
    return ok(changed);
  } catch (error) {
    return failed(error);
  }
}

/**
 * Ångra on Ta or Fyll på: the count as it is now. Fails with `validation`, `things_restore_failed` (the change is
 * gone), `things_undo_not_latest` (a newer change came after it) or `things_count_failed`.
 */
export async function undoThingChange(changeId: string): Promise<Result<{ quantity: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(changeId);
  if (!parsed.success) return fail("validation");
  try {
    const undone = await undoChangeIn(await createClient(), parsed.data);
    revalidateFor("thing_item");
    if (undone === "gone") return fail("things_restore_failed");
    if (undone === "not_latest") return fail("things_undo_not_latest");
    return ok({ quantity: undone });
  } catch (error) {
    return failed(error);
  }
}

/** Räkna and Rätta antalet: sets the count (logged as "Rättat till N"). Fails with `validation`, `things_item_gone` or `things_count_failed`. */
export async function setThingCount(input: { itemId: string; quantity: number }): Promise<Result<Changed>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = setCountInputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  try {
    const set = await setQuantityIn(await createClient(), parsed.data.itemId, parsed.data.quantity);
    revalidateFor("thing_item");
    return set === "gone" ? fail("things_item_gone") : ok(set);
  } catch (error) {
    return failed(error);
  }
}

/**
 * Sluta räkna: the count and its history go, and come back as they were for Ångra; `null` when it was not counted
 * (already stopped, e.g. on another phone), which the sheet takes quietly. Fails with `validation`,
 * `things_item_gone` or `things_count_failed`.
 */
export async function stopThingCount(itemId: string): Promise<Result<CountSnapshot | null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(itemId);
  if (!parsed.success) return fail("validation");
  try {
    const stopped = await stopCountIn(await createClient(), parsed.data);
    revalidateFor("thing_item");
    if (stopped === "gone") return fail("things_item_gone");
    return ok(stopped === "not_counted" ? null : stopped);
  } catch (error) {
    return failed(error);
  }
}

/** Ångra on Sluta räkna. Fails with `validation` or `things_restore_failed` (the föremål is gone, or counted again since). */
export async function restoreThingCount(snapshot: CountSnapshot): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = countSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return fail("validation");
  try {
    const restored = await restoreCountIn(await createClient(), parsed.data);
    revalidateFor("thing_item");
    return restored === "restored" ? ok(null) : fail("things_restore_failed");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_restore_failed", { reason: error.detail });
    return fail("things_restore_failed");
  }
}

/** The count and history a föremål's sheet shows. Fails with `validation`, `things_item_gone` or `things_unavailable`. */
export async function loadThingCount(itemId: string): Promise<Result<ThingCount>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(itemId);
  if (!parsed.success) return fail("validation");
  try {
    // Story 21.3: who else made each change, and last changed the föremål.
    const [db, others] = await Promise.all([createClient(), getOthers()]);
    const count = await loadCountIn(db, parsed.data, others);
    return count ? ok(count) : fail("things_item_gone");
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }
}

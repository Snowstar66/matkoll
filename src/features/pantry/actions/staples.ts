"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { addStapleIn, removeStapleIn, resetStaplesIn, type AddStapleOutcome } from "../data/staples";
import {
  parseStapleLimit,
  stapleFormSchema,
  stapleRestoreSchema,
  type Staple,
  type StapleLimit,
  type StapleRestore,
} from "../domain/staples";

// Inställningar → Basvaror (Pontus 2026-11-02): add a staple, remove one with
// "Ångra", and "Återställ standard". Every change applies to the household at
// once: the lists, the recipes and the meal plan are counted with it.

export type AddStapleState = Result<{ staple: Staple }> | null;

/** The outcome of an add as the action's result; `fields.name` says which one is there already. */
function addResult(outcome: AddStapleOutcome, name: string): Result<{ staple: Staple }> {
  if (outcome.kind === "duplicate") return fail("staples_duplicate", { name: `${name} finns redan.` });
  if (outcome.kind === "limit") return fail("staples_limit");
  revalidateFor("household_staple");
  return ok({ staple: outcome.staple });
}

async function add(name: string, limit: StapleLimit): Promise<Result<{ staple: Staple }>> {
  try {
    return addResult(await addStapleIn(await createClient(), name, limit), name);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("staples_save_failed", { reason: error.detail });
    return fail("staples_save_failed");
  }
}

/**
 * "Lägg till" under Basvaror: a name ("Kardemumma") and an optional limit as
 * typed ("Upp till": "1 dl", "50 g"; empty is always). For useActionState,
 * with the fields `name` and `limit`. Fails with `unauthorized`, `validation`
 * (in `fields.name`), `staples_invalid_limit` (in `fields.limit`),
 * `staples_duplicate`, `staples_limit` or `staples_save_failed`.
 */
export async function addStaple(_previous: AddStapleState, formData: FormData): Promise<AddStapleState> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = stapleFormSchema.safeParse({ name: formData.get("name") ?? "", limit: formData.get("limit") ?? "" });
  if (!parsed.success) {
    const field = parsed.error.issues[0];
    if (field?.path[0] === "limit") return fail("staples_invalid_limit", { limit: errorMessages.staples_invalid_limit });
    return fail("validation", { name: field?.message ?? errorMessages.validation });
  }
  const limit = parseStapleLimit(parsed.data.limit);
  if (!limit) return fail("staples_invalid_limit", { limit: errorMessages.staples_invalid_limit });
  return add(parsed.data.name, limit);
}

/**
 * "Ångra" after a removal: the staple back, with its name and limit as they
 * were (a new row). One that is there again already counts as done.
 */
export async function restoreStaple(staple: StapleRestore): Promise<Result<{ staple: Staple } | null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = stapleRestoreSchema.safeParse(staple);
  if (!parsed.success) return fail("validation");
  const { name, maxAmount, maxUnit } = parsed.data;
  const limit = (maxAmount === null || maxUnit === null ? { maxAmount: null, maxUnit: null } : { maxAmount, maxUnit }) as StapleLimit;
  const added = await add(name, limit);
  if (!added.ok && added.error.code === "staples_duplicate") return ok(null);
  return added;
}

const idSchema = z.uuid();

/**
 * The bin on a staple's row: removes it from the household at once; the toast
 * offers "Ångra" (restoreStaple). A staple that is gone already gives `null`.
 * Fails with `unauthorized`, `validation` or `staples_save_failed`.
 */
export async function removeStaple(id: string): Promise<Result<{ staple: Staple } | null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");
  try {
    const removed = await removeStapleIn(await createClient(), parsed.data);
    if (!removed) return ok(null);
    revalidateFor("household_staple");
    return ok({ staple: removed });
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("staples_save_failed", { reason: error.detail });
    return fail("staples_save_failed");
  }
}

/**
 * "Återställ standard": the household's staples become the default list
 * (vatten, salt, peppar, … and socker, vetemjöl, smör and oljor in small
 * amounts). Fails with `unauthorized` or `staples_save_failed`.
 */
export async function resetStaples(): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  try {
    await resetStaplesIn(await createClient());
    revalidateFor("household_staple");
    return ok();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("staples_save_failed", { reason: error.detail });
    return fail("staples_save_failed");
  }
}

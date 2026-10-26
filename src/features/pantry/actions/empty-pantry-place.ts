"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { locationSchema, type Location } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { emptyPantryPlaceIn, type EmptiedPlace } from "../data/remove";
import { revalidatePantryCommitted } from "./revalidate-committed";

const operationSchema = z.uuid();

/**
 * "Töm kylen" (Story 6.3, AD-19): deletes every item in the location for
 * good (AD-20), in one call and one transaction, after Pontus has confirmed
 * in the sheet. The server keeps the removed rows under `operationId`, the
 * client's id for this emptying, so "Ångra" (restorePantryRemoval) puts back
 * every one of them, `removed` in all. Items another tab added meanwhile go
 * too. The same operation id again (a retry after a lost answer) removes
 * nothing more and gives the same answer. No rows (another tab emptied the
 * location) is `ok`. Revalidates Hemma, the recipes, the plan and the list
 * (AD-18), also for no rows, so a list that still shows them catches up;
 * once the delete has committed, the answer is `ok`.
 *
 * Fails with `unauthorized`, `validation` or `pantry_empty_failed`; nothing
 * is removed then.
 */
export async function emptyPantryPlace(location: Location, operationId: string): Promise<Result<EmptiedPlace>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const place = locationSchema.safeParse(location);
  const operation = operationSchema.safeParse(operationId);
  if (!place.success || !operation.success) return fail("validation");

  let emptied: EmptiedPlace;
  try {
    emptied = await emptyPantryPlaceIn(await createClient(), place.data, operation.data);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_empty_failed", { reason: error.detail });
    return fail("pantry_empty_failed");
  }
  revalidatePantryCommitted();
  return ok(emptied);
}

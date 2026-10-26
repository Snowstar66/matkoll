"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { locationSchema, type Location } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { isSiteGone, PantryDataError, siteGoneCode } from "../data/client";
import { emptyPantryPlaceIn, type EmptiedPlace } from "../data/remove";
import { revalidatePantryCommitted } from "./revalidate-committed";

const operationSchema = z.uuid();
const siteSchema = z.uuid().nullable();

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
 * Story 8.4 (FR-33, AD-24): only the location of the place Hemma showed when
 * the sheet opened (`siteId`, sent as `site`) is emptied, never the place
 * selected when the call arrives. `null` is the selected place; Hemma always
 * sends its place.
 *
 * Fails with `unauthorized`, `validation`, `pantry_site_gone` (the place is
 * removed or not the user's; the page is read again) or
 * `pantry_empty_failed`; nothing is removed then.
 */
export async function emptyPantryPlace(
  location: Location,
  operationId: string,
  siteId: string | null,
): Promise<Result<EmptiedPlace>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const place = locationSchema.safeParse(location);
  const operation = operationSchema.safeParse(operationId);
  const site = siteSchema.safeParse(siteId);
  if (!place.success || !operation.success || !site.success) return fail("validation");

  let emptied: EmptiedPlace;
  try {
    emptied = await emptyPantryPlaceIn(await createClient(), place.data, operation.data, site.data);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    if (isSiteGone(error)) {
      console.error("pantry_site_gone", { reason: siteGoneCode });
      revalidateFor("pantry_site");
      return fail("pantry_site_gone");
    }
    console.error("pantry_empty_failed", { reason: error.detail });
    return fail("pantry_empty_failed");
  }
  revalidatePantryCommitted();
  return ok(emptied);
}

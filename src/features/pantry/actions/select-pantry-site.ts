"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { selectSiteIn } from "../data/sites";

const selectSchema = z.object({ id: z.uuid() });

/**
 * A tap on a place's pill in Hemma (FR-30, FR-31, AD-24): makes the place the
 * selected one for the whole app, on every device, and clears the others
 * (select_pantry_site). Matkoll never calls it by itself. Revalidates
 * everything counted against the pantry (AD-18), also when the place is
 * gone, so the stale view is read again.
 *
 * Fails with `unauthorized`, `validation`, `pantry_site_gone` (not one of
 * the user's places) or `pantry_site_failed`. Logs only the error code and
 * the Postgres code, never the place's name.
 */
export async function selectPantrySite(input: { id: string }): Promise<Result<{ site: { id: string; name: string } }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = selectSchema.safeParse(input);
  if (!parsed.success) return fail("validation");

  try {
    const outcome = await selectSiteIn(await createClient(), parsed.data.id);
    revalidateFor("pantry_site");
    if (outcome.kind === "gone") return fail("pantry_site_gone");
    return ok({ site: { id: outcome.site.id, name: outcome.site.name } });
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_site_failed", { reason: error.detail });
    return fail("pantry_site_failed");
  }
}

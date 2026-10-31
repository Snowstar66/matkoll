"use server";

import { requireUser } from "@/features/auth/server";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { saveSiteIn } from "../data/sites";
import {
  type PantrySite,
  readSiteForm,
  type SiteSaveMode,
  siteFieldErrors,
  siteFormSchema,
  siteNameTakenText,
} from "../domain/site";

export type SavePantrySiteState = Result<{ site: PantrySite; mode: SiteSaveMode }> | null;

/**
 * "Lägg till" under "Nytt boende" (mode `add`) and "Spara" on a place's row
 * (mode `rename`) in the sheet Boenden (FR-29, AD-24): adds the place with
 * the client's id, not selected, or renames it. For useActionState, with the
 * fields of siteFormSchema (`id`, `name`, `mode`). The id is chosen when the
 * sheet opens and kept until the name changes, so a retry after a lost
 * answer adds one place; a retry whose place was renamed since keeps the
 * rename (`pantry_site_failed`). Revalidates everything counted against the
 * pantry (AD-18) after every answer from the database, so a stale sheet is
 * read again.
 *
 * Fails with `unauthorized`, `validation` (with the messages by field),
 * `pantry_site_name_taken` (at `name`, with the place's name as stored, so
 * "stugan" gives "… som heter Stugan."), `pantry_site_limit`
 * (at `name`), `pantry_site_gone` (a rename of a place that is gone) or
 * `pantry_site_failed`. Logs only the error code and the Postgres code, never
 * the name.
 */
export async function savePantrySite(_previous: SavePantrySiteState, formData: FormData): Promise<SavePantrySiteState> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = siteFormSchema.safeParse(readSiteForm(formData));
  if (!parsed.success) {
    const fields = siteFieldErrors(parsed.error);
    return Object.keys(fields).length > 0 ? fail("validation", fields) : fail("validation");
  }

  try {
    const outcome = await saveSiteIn(await createClient(), parsed.data);
    // Every outcome means the sheet may show stale places: they are read again.
    revalidateFor("pantry_site");
    switch (outcome.kind) {
      case "name_taken":
        return fail("pantry_site_name_taken", { name: siteNameTakenText(outcome.name) });
      case "limit":
        return fail("pantry_site_limit", { name: errorMessages.pantry_site_limit });
      case "gone":
        return fail("pantry_site_gone");
      case "stale":
        // A retried add whose place was renamed since: the rename stays, and nothing is announced as added.
        console.error("pantry_site_failed", { reason: "stale_retry" });
        return fail("pantry_site_failed");
      default:
        return ok({ site: outcome.site, mode: parsed.data.mode });
    }
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_site_failed", { reason: error.detail });
    return fail("pantry_site_failed");
  }
}

"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { SettingsDataError } from "../data/client";
import { addRecipeSiteIn } from "../data/sites";
import { domainNameSchema } from "../domain/domain-name";

export type AddRecipeSiteState = Result<{ domain: string }> | null;

const addSiteSchema = z.object({ domain: domainNameSchema });

/**
 * "Lägg till" under Godkända receptsajter (FR7): normalises what Pontus typed
 * ("https://www.Arla.se/recept" → "arla.se") and adds the site, or turns it on
 * again when it was turned off. Applies at once: the import flow reads the
 * sites on every request. For useActionState, with the field `domain`. Fails
 * with `unauthorized`, `settings_invalid_domain`, `settings_duplicate_domain`
 * ("koket.se finns redan." in `fields.domain`) or `settings_save_failed`.
 */
export async function addRecipeSite(_previous: AddRecipeSiteState, formData: FormData): Promise<AddRecipeSiteState> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = addSiteSchema.safeParse({ domain: formData.get("domain") ?? "" });
  if (!parsed.success) return invalidDomain();
  const { domain } = parsed.data;

  try {
    const outcome = await addRecipeSiteIn(await createClient(), user.data.id, domain);
    if (outcome === "invalid") return invalidDomain();
    if (outcome === "duplicate") return fail("settings_duplicate_domain", { domain: `${domain} finns redan.` });
    revalidateFor("recipe_site");
    return ok({ domain });
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_save_failed", { reason: error.detail });
    return fail("settings_save_failed");
  }
}

function invalidDomain() {
  return fail("settings_invalid_domain", { domain: errorMessages.settings_invalid_domain });
}

"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { SettingsDataError } from "../data/client";
import { setRecipeSiteActiveIn } from "../data/sites";
import { domainNameSchema } from "../domain/domain-name";

export type RecipeSiteChange = { domain: string; isActive: boolean };
/** The change as made; `changed` is false when the site was that way already (or, turning off, not there). */
export type RecipeSiteChangeResult = RecipeSiteChange & { changed: boolean };

const changeSchema = z.object({ domain: domainNameSchema, isActive: z.boolean() });

/**
 * "Ta bort" (isActive false) and its "Ångra" (isActive true) for an approved
 * recipe site (FR7). The site is turned off, never deleted
 * (docs/beslutslogg.md), so it stays off after the next sign-in. Turning off
 * a site the user does not have counts as done, with `changed: false`;
 * turning one on fails. Fails with `unauthorized`, `validation` or
 * `settings_save_failed`.
 */
export async function setRecipeSiteActive(change: RecipeSiteChange): Promise<Result<RecipeSiteChangeResult>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = changeSchema.safeParse(change);
  if (!parsed.success) return fail("validation");
  const { domain, isActive } = parsed.data;

  try {
    const outcome = await setRecipeSiteActiveIn(await createClient(), user.data.id, domain, isActive);
    if (outcome === "missing" && isActive) {
      console.error("settings_save_failed", { reason: "not_found" });
      return fail("settings_save_failed");
    }
    const changed = outcome === "changed";
    if (changed) revalidateFor("recipe_site");
    return ok({ domain, isActive, changed });
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_save_failed", { reason: error.detail });
    return fail("settings_save_failed");
  }
}

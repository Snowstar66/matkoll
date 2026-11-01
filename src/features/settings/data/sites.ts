import "server-only";
import { SettingsDataError, type SettingsDb } from "./client";

// Writes to recipe_site for Inställningar (FR7, AD-1). A site is never
// deleted: "Ta bort" turns it off (is_active = false), so the start data in
// ensure_user_defaults() does not bring it back (docs/beslutslogg.md).

/** The table's constraints (supabase/migrations/*_settings*.sql); Postgres names them in its error messages. */
const uniqueDomainConstraint = "recipe_site_household_id_domain_key";
const domainCheckConstraint = "recipe_site_domain_check";

type PostgresError = { code: string; message: string };

function violates(error: PostgresError, code: string, constraint: string): boolean {
  return error.code === code && error.message.includes(constraint);
}

/** What adding a site did: `added` a new row, `reactivated` an off one, or nothing. */
export type AddSiteOutcome = "added" | "reactivated" | "duplicate" | "invalid";

/** Turns the household's site on when it is there and off; true when it did. */
async function reactivate(db: SettingsDb, domain: string): Promise<boolean> {
  const { data, error } = await db
    .from("recipe_site")
    .update({ is_active: true })
    .eq("domain", domain)
    .eq("is_active", false)
    .select("domain");
  if (error) throw new SettingsDataError(`update_failed ${error.code}`);
  return data.length > 0;
}

/**
 * Adds `domain` (already in the stored form) for the signed-in user. A site
 * that is there but turned off is turned on again; one that is on already is
 * `duplicate`. A domain the table's check refuses is `invalid`. Throws
 * SettingsDataError when Supabase fails.
 */
export async function addRecipeSiteIn(db: SettingsDb, userId: string, domain: string): Promise<AddSiteOutcome> {
  if (await reactivate(db, domain)) return "reactivated";

  // RLS checks that user_id is the signed-in user and the row the household's.
  const inserted = await db.from("recipe_site").insert({ user_id: userId, domain });
  if (!inserted.error) return "added";
  if (violates(inserted.error, "23505", uniqueDomainConstraint)) {
    // The site is there: on, or turned off between the update and the insert.
    return (await reactivate(db, domain)) ? "reactivated" : "duplicate";
  }
  // The table's check refuses the domain, e.g. "www.www.koket.se" → "www.koket.se".
  if (violates(inserted.error, "23514", domainCheckConstraint)) return "invalid";
  throw new SettingsDataError(`insert_failed ${inserted.error.code}`);
}

/** What turning a site on or off did: `changed` it, found it `unchanged` already, or found it `missing`. */
export type SetSiteOutcome = "changed" | "unchanged" | "missing";

/**
 * Turns the household's site `domain` on or off. RLS hides other households'
 * rows, so their sites are `missing`. Throws SettingsDataError when Supabase
 * fails.
 */
export async function setRecipeSiteActiveIn(db: SettingsDb, domain: string, isActive: boolean): Promise<SetSiteOutcome> {
  const changed = await db
    .from("recipe_site")
    .update({ is_active: isActive })
    .eq("domain", domain)
    .eq("is_active", !isActive)
    .select("domain");
  if (changed.error) throw new SettingsDataError(`update_failed ${changed.error.code}`);
  if (changed.data.length > 0) return "changed";

  const existing = await db.from("recipe_site").select("domain").eq("domain", domain);
  if (existing.error) throw new SettingsDataError(`query_failed ${existing.error.code}`);
  return existing.data.length > 0 ? "unchanged" : "missing";
}

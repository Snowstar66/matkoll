import { z } from "zod";
import { charLength, oneLine } from "@/lib/one-line";

// Places in the pantry (FR-29, AD-24, Story 8.1): Pontus can keep a pantry in
// several places, for example Hemma and Stugan, and one of them is selected.
// The whole app counts against the selected place, and the pantry is never
// summed over places. Every place has the locations Kyl, Frys and Skafferi
// (AD-12); a place is never a location. Pure, so it is tested without a
// database. The table's checks (supabase/migrations/*_pantry_site.sql) follow
// the same rules (tests/design/pantry-site-checks.test.ts).

/** The first place, which every user has: the migration and ensure_pantry_defaults() create it. */
export const defaultSiteName = "Hemma";
/** The longest name, in characters (code points), as pantry_site_name_check counts them (char_length). */
export const maxSiteNameChars = 40;
/** The most places a user may have (save_pantry_site, Story 8.2). */
export const maxSites = 10;

/**
 * The name as stored in pantry_site.normalized_name, unique per user: on one
 * line with single spaces and trimmed (oneLine), in Unicode NFC and lower
 * case as Swedish has it. "  Stugan " and "STUGAN" are both "stugan". The
 * only normalization of a place's name: SQL stores what this gives and never
 * compares names itself, because Postgres's lower() depends on the
 * database's collation (AD-24).
 */
export function normalizeSiteName(name: string): string {
  return oneLine(name).normalize("NFC").toLocaleLowerCase("sv");
}

/** A place as listPantrySites gives it, in the order the places were created. */
export type PantrySite = { id: string; name: string; isSelected: boolean };

/** The selected place, and how many places the user has (the line "Lager: Stugan" shows from two). */
export type SelectedSite = { id: string; name: string; siteCount: number };

/** A pantry_site row as the database gives it, read as a PantrySite. */
export const pantrySiteRowSchema = z
  .object({
    id: z.uuid(),
    name: z.string().refine((name) => name.length > 0 && charLength(name) <= maxSiteNameChars),
    is_selected: z.boolean(),
  })
  .transform((row): PantrySite => ({ id: row.id, name: row.name, isSelected: row.is_selected }));

/** What the texts below need of a place. */
type NamedSite = Pick<SelectedSite, "name" | "siteCount">;

/**
 * The place's name where a text names it, or `null` with one place (or none,
 * or a place that could not be read): then everything reads as in 1.0,
 * without place names (UX-DR17). The basis of siteLineText and siteSuffix.
 */
export function shownSiteName(site: NamedSite | null): string | null {
  return site && site.siteCount > 1 ? site.name : null;
}

/**
 * "Lager: Stugan": the line that says which place the status is counted
 * against, under the page title in Recept (Kan lagas nu), Matsedel and
 * Inköpslista, and under "X av Y hemma" in the recipe view; `null` with one
 * place. Every module writes the line with this, so it reads the same
 * everywhere (AD-24).
 */
export function siteLineText(site: NamedSite | null): string | null {
  const name = shownSiteName(site);
  return name === null ? null : `Lager: ${name}`;
}

/** " för Stugan", for texts such as "Lagt 8 varor i lagret för Stugan."; "" with one place. */
export function siteSuffix(site: NamedSite | null): string {
  const name = shownSiteName(site);
  return name === null ? "" : ` för ${name}`;
}

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

/**
 * A place with the number of items on it, over its three locations, as the
 * sheet Ställen shows it (listPantrySitesWithCounts, Story 8.2). `null` when
 * the counts could not be read: the sheet then shows no count and offers no
 * "Ta bort".
 */
export type PantrySiteWithCount = PantrySite & { itemCount: number | null };

/** The selected place, and how many places the user has (the line "Lager: Stugan" shows from two). */
export type SelectedSite = { id: string; name: string; siteCount: number };

/** A place's name as the database keeps it: 1 to maxSiteNameChars characters (pantry_site_name_check). */
const siteNameSchema = z.string().refine((name) => name.length > 0 && charLength(name) <= maxSiteNameChars);

/**
 * The place a photo was taken for (Story 8.4, FR-33, AD-24): its id, which
 * every write from the photo's suggestions sends, and its name, for
 * "Förslagen gäller Stugan.".
 */
export const photoSiteSchema = z.object({ id: z.uuid(), name: siteNameSchema });
export type PhotoSite = z.infer<typeof photoSiteSchema>;

/** A pantry_site row as the database gives it, read as a PantrySite. */
export const pantrySiteRowSchema = z
  .object({
    id: z.uuid(),
    name: siteNameSchema,
    is_selected: z.boolean(),
  })
  .transform((row): PantrySite => ({ id: row.id, name: row.name, isSelected: row.is_selected }));

// Story 8.2: the sheet Ställen and the site switch in Hemma (FR-29, FR-30,
// FR-31). The texts follow EXPERIENCE.md, Voice and Tone.

/** Under the field when the name is empty, only spaces or only invisible characters. */
export const emptySiteNameText = "Ange ett namn på stället.";
/** Under the field when the name is longer than maxSiteNameChars. */
export const siteNameTooLongText = `Namnet får vara högst ${maxSiteNameChars} tecken.`;
/** Under the field when the user has maxSites places already. */
export const siteLimitText = `Du kan ha högst ${maxSites} ställen.`;
/** The mark on the selected place's row in the sheet Ställen. */
export const selectedSiteLabel = "Valt";

/** "Det finns redan ett ställe som heter Stugan.", under the field. */
export function siteNameTakenText(name: string): string {
  return `Det finns redan ett ställe som heter ${name}.`;
}

/** The confirmation after "Lägg till": a new place is never selected by itself. */
export function addedSiteText(name: string): string {
  return `Lade till ${name}. Välj det för att se och fylla dess lager.`;
}

/** The confirmation after a new name is saved. */
export function renamedSiteText(name: string): string {
  return `Stället heter nu ${name}.`;
}

/** The confirmation after "Ta bort". */
export function removedSiteText(name: string): string {
  return `Tog bort ${name}.`;
}

/** What the live region says after a place is selected. */
export function selectedSiteText(name: string): string {
  return `Valt ställe: ${name}.`;
}

/**
 * Whether "Ta bort" is offered for `site`: it is empty, not selected, and not
 * the last of `sites` (delete_pantry_site refuses the rest, MK423).
 */
export function canRemoveSite(site: PantrySiteWithCount, sites: readonly PantrySite[]): boolean {
  return site.itemCount === 0 && !site.isSelected && sites.length > 1;
}

/**
 * What never shows as a mark on its own, besides what oneLine removes:
 * spaces of every kind (\p{Z}), format characters (\p{Cf}, the soft hyphen
 * among them), the Hangul fillers, the Mongolian vowel separator, the
 * combining grapheme joiner, variation selectors and the blank braille
 * pattern. A name of nothing but these looks empty.
 */
const invisibleInName =
  /[\p{Z}\p{Cf}\u034f\u115f\u1160\u180e\u2800\u3164\ufe00-\ufe0f\uffa0\u{e0100}-\u{e01ef}]/gu;

/** Whether `name` has at least one character that shows. */
export function hasVisibleCharacter(name: string): boolean {
  return name.replace(invisibleInName, "").length > 0;
}

/**
 * `add` from the field "Nytt ställe": adds the place, or renames the user's
 * place with the same id (a retry after a lost answer). `rename` from a row:
 * only renames, and a place that is gone is `pantry_site_gone`.
 */
export const SITE_SAVE_MODES = ["add", "rename"] as const;
export type SiteSaveMode = (typeof SITE_SAVE_MODES)[number];

/** What the sheet sends and savePantrySite reads: the fields as typed. */
export type SiteFormInput = { id: string; name: string; mode: string };

/** The form's fields from FormData: the same reading in the sheet and in savePantrySite. */
export function readSiteForm(formData: FormData): SiteFormInput {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return { id: text("id"), name: text("name"), mode: text("mode") };
}

/**
 * A place as Pontus names it in the sheet Ställen: `id` is chosen by the
 * client (AD-20), the name is made one line (oneLine), has at least one
 * character that shows (hasVisibleCharacter) and has 1 to maxSiteNameChars
 * characters, and its normalized form is the only one
 * pantry_site stores (normalizeSiteName, AD-24). One schema for the sheet and
 * savePantrySite.
 */
export const siteFormSchema = z
  .object({ id: z.uuid(), name: z.string(), mode: z.enum(SITE_SAVE_MODES) })
  .transform((form, context) => {
    const name = oneLine(form.name);
    if (!name || !hasVisibleCharacter(name)) {
      context.addIssue({ code: "custom", path: ["name"], message: emptySiteNameText });
      return z.NEVER;
    }
    if (charLength(name) > maxSiteNameChars) {
      context.addIssue({ code: "custom", path: ["name"], message: siteNameTooLongText });
      return z.NEVER;
    }
    return { id: form.id, name, normalizedName: normalizeSiteName(name), mode: form.mode };
  });
export type SiteForm = z.output<typeof siteFormSchema>;

/**
 * The form's own messages by field name (`name`), the first per field, for
 * `fail("validation", fields)` and the sheet. Zod's built-in messages are
 * English and never shown, so only custom issues count.
 */
export function siteFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (issue.code === "custom" && field && !(field in fields)) fields[field] = issue.message;
  }
  return fields;
}

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

// Story 8.5: "Byt" on the line "Lager: Hemma" in Inköpslista, and the sheet
// it opens (FR-32, EXPERIENCE.md, Voice and Tone). It is the same selection
// as the pills in Hemma.

/** The title of the sheet Byt ställe, opened from Inköpslista. */
export const switchListTitle = "Räkna listan mot";
/** The text button beside "Lager: Hemma" in Inköpslista. */
export const switchListButtonText = "Byt";
/** The button's accessible name: "Byt" alone is unclear to a screen reader without the line beside it. */
export const switchListButtonLabel = "Byt lager för listan";

/** The short confirmation once the list is counted against the place chosen in the sheet. */
export function listCountedAgainstText(name: string): string {
  return `Listan räknas nu mot ${name}.`;
}

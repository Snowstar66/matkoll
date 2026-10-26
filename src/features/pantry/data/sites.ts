import "server-only";
import { pantrySiteRowSchema, type PantrySite, type SiteForm } from "../domain/site";
import { PantryDataError, type PantryDb } from "./client";

// Every function needs the signed-in user's session client, never an admin
// client: RLS limits pantry_site to the user's own places, and "the selected
// place" is the session user's. The writes go through the Postgres functions
// save_pantry_site, select_pantry_site and delete_pantry_site, which take
// pantry_lock() first (supabase/migrations/*_pantry_site_manage.sql, AD-24).
// Errors carry only a fixed reason and the Postgres code, never a name.

/**
 * The signed-in user's places (RLS limits the rows to the user's own), in the
 * order they were created (created_at, then id), never by name, so the
 * database's collation plays no part. A user has at most a few places, so one
 * query without paging reads them all. An empty list for a user without
 * places (before ensure_pantry_defaults). Only the pantry module reads
 * pantry_site (AD-1). Throws PantryDataError.
 */
export async function loadPantrySitesIn(db: PantryDb): Promise<PantrySite[]> {
  const { data, error } = await db
    .from("pantry_site")
    .select("id, name, is_selected")
    .order("created_at")
    .order("id");
  if (error) throw new PantryDataError(`query_failed ${error.code}`);
  return data.map((row) => {
    const parsed = pantrySiteRowSchema.safeParse(row);
    if (!parsed.success) throw new PantryDataError("invalid_row");
    return parsed.data;
  });
}

/**
 * The id of the signed-in user's selected place, or null when the user has
 * none (before ensure_pantry_defaults). Reads only; it never creates a place.
 * Throws PantryDataError.
 */
export async function loadSelectedSiteIdIn(db: PantryDb): Promise<string | null> {
  const { data, error } = await db.from("pantry_site").select("id").eq("is_selected", true).maybeSingle();
  if (error) throw new PantryDataError(`query_failed ${error.code}`);
  return data?.id ?? null;
}

/** The unique key on the user's normalized names; Postgres names it in its error message. */
const nameKey = "pantry_site_user_id_normalized_name_key";

/** A pantry_site row from a function's answer, as a PantrySite. */
function toSite(row: unknown): PantrySite {
  const parsed = pantrySiteRowSchema.safeParse(row);
  if (!parsed.success) throw new PantryDataError("invalid_row");
  return parsed.data;
}

/**
 * What saving a place did: `saved` it, or found no place to rename (`gone`,
 * MK410), another of the user's places with the same normalized name
 * (`name_taken`, with that place's name as stored, for "Det finns redan ett
 * ställe som heter Stugan."), 10 places already (`limit`, MK422), or, for a
 * retried add, the id on a place that has been renamed since (`stale`,
 * MK424; the rename stays).
 */
export type SaveSiteOutcome =
  | { kind: "saved"; site: PantrySite }
  | { kind: "gone" }
  | { kind: "name_taken"; name: string }
  | { kind: "limit" }
  | { kind: "stale" };

/**
 * The name of the user's place with `normalizedName`, as stored, for the
 * message about a taken name; `fallback` when it cannot be read (it may have
 * gone since).
 */
async function takenName(db: PantryDb, normalizedName: string, fallback: string): Promise<string> {
  const { data } = await db.from("pantry_site").select("name").eq("normalized_name", normalizedName).maybeSingle();
  return data?.name ?? fallback;
}

/**
 * Saves the signed-in user's place `form.id` with `form.mode`
 * (save_pantry_site): `add` adds it, not selected (on a retry, the user's
 * place with that id and the same normalized name keeps the name as typed),
 * `rename` only renames it. Throws
 * PantryDataError `failed <code>` when Postgres refuses otherwise.
 */
export async function saveSiteIn(db: PantryDb, form: SiteForm): Promise<SaveSiteOutcome> {
  const { data, error } = await db.rpc("save_pantry_site", {
    site_id: form.id,
    site_name: form.name,
    site_normalized_name: form.normalizedName,
    mode: form.mode,
  });
  if (error) {
    if (error.code === "MK410") return { kind: "gone" };
    if (error.code === "MK422") return { kind: "limit" };
    if (error.code === "MK424") return { kind: "stale" };
    if (error.code === "23505" && error.message.includes(nameKey)) {
      return { kind: "name_taken", name: await takenName(db, form.normalizedName, form.name) };
    }
    throw new PantryDataError(`failed ${error.code}`);
  }
  return { kind: "saved", site: toSite(data) };
}

/** What selecting a place did: `selected` it, or found that the user has no place with the id (`gone`, MK410). */
export type SelectSiteOutcome = { kind: "selected"; site: PantrySite } | { kind: "gone" };

/**
 * Makes the signed-in user's place `id` the selected one, and clears the
 * others, in one transaction (select_pantry_site). Throws PantryDataError
 * `failed <code>` when Postgres refuses otherwise.
 */
export async function selectSiteIn(db: PantryDb, id: string): Promise<SelectSiteOutcome> {
  const { data, error } = await db.rpc("select_pantry_site", { site_id: id });
  if (error) {
    if (error.code === "MK410") return { kind: "gone" };
    throw new PantryDataError(`failed ${error.code}`);
  }
  return { kind: "selected", site: toSite(data) };
}

/**
 * What deleting a place did: `deleted`, `removed` false when the user had no
 * place with the id (gone already), or `in_use` when it is selected, has
 * items or is the last one (MK423; 23503 when items came by a direct write).
 */
export type DeleteSiteOutcome = { kind: "deleted"; removed: boolean } | { kind: "in_use" };

/**
 * Deletes the signed-in user's place `id` when it is empty, not selected and
 * not the last (delete_pantry_site). Throws PantryDataError `failed <code>`
 * when Postgres refuses otherwise.
 */
export async function deleteSiteIn(db: PantryDb, id: string): Promise<DeleteSiteOutcome> {
  const { data, error } = await db.rpc("delete_pantry_site", { site_id: id });
  if (error) {
    if (error.code === "MK423" || error.code === "23503") return { kind: "in_use" };
    throw new PantryDataError(`failed ${error.code}`);
  }
  return { kind: "deleted", removed: data === true };
}

/**
 * The number of the signed-in user's pantry items on each of the user's
 * places, over each place's locations, in one grouped query
 * (pantry_site_item_counts). A place without items is left out. Throws
 * PantryDataError (`query_failed <code>`, `invalid_row`).
 */
export async function loadSiteItemCountsIn(db: PantryDb): Promise<Record<string, number>> {
  const { data, error } = await db.rpc("pantry_site_item_counts");
  if (error) throw new PantryDataError(`query_failed ${error.code}`);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (typeof row.site_id !== "string" || !Number.isInteger(row.item_count)) throw new PantryDataError("invalid_row");
    counts[row.site_id] = row.item_count;
  }
  return counts;
}

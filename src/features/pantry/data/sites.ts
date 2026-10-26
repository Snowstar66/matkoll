import "server-only";
import { pantrySiteRowSchema, type PantrySite } from "../domain/site";
import { PantryDataError, type PantryDb } from "./client";

// Both functions need the signed-in user's session client, never an admin
// client: RLS limits pantry_site to the user's own places, and "the selected
// place" is the session user's.

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

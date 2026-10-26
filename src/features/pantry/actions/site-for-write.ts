import "server-only";
import { PantryDataError, type PantryDb } from "../data/client";
import { loadPantrySitesIn } from "../data/sites";

/** Whether a write from lagerförslag may go ahead with the place it was sent. */
export type SiteForWrite = { ok: true } | { ok: false; reason: "site_gone" | "unavailable" };

/**
 * Story 8.4 (FR-33): a write from lagerförslag goes to the photo's place
 * (`siteId`), whose ownership the database checks (MK410). Without a place
 * (`null`) it would go to the place selected when the call arrives, which is
 * allowed only for a user without places: a user with places gets
 * `site_gone` and nothing is written, so a write never falls back to the
 * selected place in silence. `unavailable` when the places cannot be read.
 */
export async function checkSiteForWrite(db: PantryDb, siteId: string | null): Promise<SiteForWrite> {
  if (siteId !== null) return { ok: true };
  try {
    const sites = await loadPantrySitesIn(db);
    return sites.length === 0 ? { ok: true } : { ok: false, reason: "site_gone" };
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_unavailable", { reason: error.detail });
    return { ok: false, reason: "unavailable" };
  }
}

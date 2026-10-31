"use server";

import { requireUser } from "@/features/auth/server";
import type { BoendeCounts } from "@/features/pantry";
import { listPantrySitesWithCounts, PantryDataError } from "@/features/pantry/server";
import { getClearCounts, ThingsDataError } from "@/features/things/server";

/**
 * What each boende holds, for the boende menu (Story 16.14): the menu asks when
 * it opens, so the counts are never older than the tap. Matvaror come from the
 * pantry, prylar and kort from Förråd (the same counts as "Rensa förrådet").
 * `null` when they cannot be read, or the session has ended: the menu then
 * shows the names alone.
 */
export async function loadBoendeCounts(): Promise<Record<string, BoendeCounts> | null> {
  const user = await requireUser();
  if (!user.ok) return null;
  try {
    const sites = await listPantrySitesWithCounts();
    const entries = await Promise.all(
      sites.map(async (site) => {
        const things = await getClearCounts(site.id);
        return [site.id, { items: site.itemCount ?? 0, things: things.things, cards: things.cards }] as const;
      }),
    );
    return Object.fromEntries(entries);
  } catch (error) {
    if (!(error instanceof PantryDataError) && !(error instanceof ThingsDataError)) throw error;
    console.error("boende_counts_unavailable", { reason: error.detail });
    return null;
  }
}

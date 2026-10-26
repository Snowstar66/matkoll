import "server-only";
import type { PantrySnapshot, SelectedSite } from "@/features/pantry";
import { getPantrySnapshot, getSelectedSite, PantryDataError } from "@/features/pantry/server";

/**
 * The signed-in user's pantry for the recipes' status, or `null` when it
 * cannot be read (logged as `pantry_unavailable`): the status never takes the
 * recipes down, they are shown without it. The pantry is the selected
 * place's (AD-24). Other errors are bugs and are thrown.
 */
export async function pantrySnapshotOrNull(): Promise<PantrySnapshot | null> {
  try {
    return await getPantrySnapshot();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_unavailable", { reason: error.detail });
    return null;
  }
}

/**
 * The signed-in user's selected place, for the line "Lager: Stugan", or
 * `null` when the user has none or it cannot be read (logged as
 * `pantry_unavailable`). Other errors are bugs and are thrown.
 */
export async function selectedSiteOrNull(): Promise<SelectedSite | null> {
  try {
    return await getSelectedSite();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_unavailable", { reason: error.detail });
    return null;
  }
}

/** The pantry for the status and the place it is of; see pantryForStatus. */
export type PantryForStatus = { snapshot: PantrySnapshot | null; site: SelectedSite | null };

/**
 * The pantry for the recipes' status and the place it is of, read in
 * parallel. Both are memoised per request and read the same selected place
 * (pantry.getSelectedSite), so the line "Lager" always names the place the
 * status was counted against. Without a status there is no place either: a
 * pantry that cannot be read gives `{ snapshot: null, site: null }`.
 */
export async function pantryForStatus(): Promise<PantryForStatus> {
  const [snapshot, site] = await Promise.all([pantrySnapshotOrNull(), selectedSiteOrNull()]);
  return { snapshot, site: snapshot ? site : null };
}

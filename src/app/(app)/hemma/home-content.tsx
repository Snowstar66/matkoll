import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { Location } from "@/features/catalog";
import { CatalogDataError } from "@/features/catalog/server";
import type { PantryItem, SelectedSite } from "@/features/pantry";
import { countPantryItems, isPantrySiteGone, listPantry, PantryDataError } from "@/features/pantry/server";
import { AddSiteButton } from "@/features/pantry/ui/add-site-button";
import { PantryCamera } from "@/features/pantry/ui/pantry-camera";
import { PantryPlace } from "@/features/pantry/ui/pantry-place";
import { PantrySuggestionList } from "@/features/pantry/ui/pantry-suggestion-list";
import { errorMessages } from "@/lib/errors";

export type HomeContentProps = {
  /** The place Hemma shows: the selected one, as page.tsx read it (Story 8.2). */
  site: SelectedSite;
  /** The chosen location. */
  location: Location;
  /** Where the login page sends Pontus back to. */
  next: string;
};

/**
 * Hemma's data, for a <Suspense> in page.tsx (AD-18): the location cards and
 * the chosen location's items on the place `site`. The chosen card's count is
 * the number of items listed (PantryPlace), so card and list never disagree;
 * the other two are counted by the database. When the pantry or the
 * catalog's names cannot be read, a notice says so, with the camera button
 * and the suggestions under it (a photo needs no list); a place deleted in
 * the meantime says so too (`pantry_site_gone`). With one place, "Lägg till
 * ställe" is there in both cases. Other errors go to the error boundary.
 */
export async function HomeContent({ site, location, next }: HomeContentProps) {
  await requireUserOrRedirect(next);

  let counts: Record<Location, number>;
  let items: PantryItem[];
  try {
    [counts, items] = await Promise.all([countPantryItems(site.id), listPantry(location, site.id)]);
  } catch (error) {
    let message: string = errorMessages.pantry_unavailable;
    if (error instanceof PantryDataError) {
      const gone = isPantrySiteGone(error);
      if (gone) message = errorMessages.pantry_site_gone;
      console.error(gone ? "pantry_site_gone" : "pantry_unavailable", { reason: error.detail });
    } else if (error instanceof CatalogDataError) {
      console.error("pantry_unavailable", { reason: error.code, detail: error.detail });
    } else {
      throw error;
    }
    return (
      <div className="flex flex-col gap-6">
        <Notice role="alert">{message}</Notice>
        <PantryCamera site={site} location={location} />
        <PantrySuggestionList siteId={site.id} />
        {/* With one place, the sheet Ställen is reached only from here (needs a SiteSwitch above). */}
        {site.siteCount === 1 ? <AddSiteButton /> : null}
      </div>
    );
  }

  return <PantryPlace site={site} location={location} counts={counts} items={items} />;
}

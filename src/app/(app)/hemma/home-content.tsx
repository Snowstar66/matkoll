import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { Location } from "@/features/catalog";
import { CatalogDataError } from "@/features/catalog/server";
import { photoTimeText, type PantryItem, type SelectedSite } from "@/features/pantry";
import { countPantryItems, isPantrySiteGone, listPantry, listPlacePhotos, PantryDataError } from "@/features/pantry/server";
import { AddSiteButton } from "@/features/pantry/ui/add-site-button";
import { LatestPhoto, type ShownPlacePhoto } from "@/features/pantry/ui/latest-photo";
import { PantryCamera } from "@/features/pantry/ui/pantry-camera";
import { PantryPlace } from "@/features/pantry/ui/pantry-place";
import { PantrySuggestionList } from "@/features/pantry/ui/pantry-suggestion-list";
import { errorMessages } from "@/lib/errors";
import { PhotoSweepGate } from "./photo-sweep-gate";

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
 * boende" is there in both cases. Other errors go to the error boundary.
 *
 * Story 10.2: the latest photo of the chosen location on the place, younger
 * than 30 days, is read with them (its row only, never the image), and its
 * line "Senaste foto av kylen: idag 15:42" comes right under the camera
 * button, also when the pantry could not be read. The time is written here,
 * on the server, in Swedish time. Without a photo, or when the photos could
 * not be read (listPlacePhotos logs it), there is no line.
 *
 * Story 10.3: when the user has photos older than 30 days, PhotoSweepGate
 * renders PhotoSweep, which has them swept; nothing is shown. It is read in a
 * Suspense boundary of its own, so the page never waits for it, and any
 * error there is caught and shows nothing.
 */
export async function HomeContent({ site, location, next }: HomeContentProps) {
  await requireUserOrRedirect(next);

  // Started first, so it is read alongside the pantry, and is there for the notice below too.
  const photoRead = latestPhoto(site.id, location);
  // Awaited below, unless the pantry fails with a bug, which goes to the error boundary without it.
  photoRead.catch(() => {});
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
        <PantryCamera site={site} location={location}>
          <LatestPhoto photo={await photoRead} location={location} />
        </PantryCamera>
        <PantrySuggestionList siteId={site.id} />
        {/* With one place, the sheet Boenden is reached only from here (needs a SiteSwitch above). */}
        {site.siteCount === 1 ? <AddSiteButton /> : null}
      </div>
    );
  }

  const photo = await photoRead;
  return (
    <>
      <Suspense fallback={null}>
        <PhotoSweepGate />
      </Suspense>
      <PantryPlace site={site} location={location} counts={counts} items={items} photo={photo} />
    </>
  );
}

/**
 * The latest photo of `location` on the place `siteId` (listPlacePhotos),
 * with the time it was taken as the line writes it, or `null` for none.
 */
async function latestPhoto(siteId: string, location: Location): Promise<ShownPlacePhoto | null> {
  const { photos } = await listPlacePhotos(siteId);
  const photo = photos.find((candidate) => candidate.location === location);
  return photo ? { ...photo, time: photoTimeText(photo.takenAt, new Date()) } : null;
}

import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { type PantrySiteWithCount, type SelectedSite } from "@/features/pantry";
import { listPantrySitesWithCounts, PantryDataError } from "@/features/pantry/server";
import { SiteSwitch, SiteSwitchProvider } from "@/features/pantry/ui/site-switch";
import { roomSuggestions, thingsEmptyText } from "@/features/things";
import { listThingPlaces, ThingsDataError } from "@/features/things/server";
import { NewPlace } from "@/features/things/ui/new-place-sheet";
import { PlacesList } from "@/features/things/ui/places-list";
import { errorMessages } from "@/lib/errors";

/**
 * The tab's data: the user's boenden (for the pills) and the places of the
 * selected one. The data's <Suspense> is keyed on the boende, so choosing
 * another shows the skeleton rows instead of the old places. When the boenden
 * or the places cannot be read, a notice says so; other errors go to the error boundary.
 */
export async function PrylarContent() {
  await requireUserOrRedirect("/prylar");

  let sites: PantrySiteWithCount[] | null = null;
  try {
    sites = await listPantrySitesWithCounts();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
  }
  const selected = sites?.find((site) => site.isSelected);
  if (!sites || !selected) {
    // The boenden could not be read, or the user has none yet (before ensure_pantry_defaults, which every sign-in runs).
    if (sites) console.error("things_unavailable", { reason: "no_selected_site" });
    return (
      <>
        <PageHeader title="Prylar" />
        <Notice role="alert">{errorMessages.things_unavailable}</Notice>
      </>
    );
  }
  const site: SelectedSite = { id: selected.id, name: selected.name, siteCount: sites.length };

  return (
    <SiteSwitchProvider>
      <PageHeader title="Prylar" />
      <SiteSwitch sites={sites} selected={site}>
        <Suspense key={site.id} fallback={<Skeleton rows={3} />}>
          <Places siteId={site.id} />
        </Suspense>
      </SiteSwitch>
    </SiteSwitchProvider>
  );
}

async function Places({ siteId }: { siteId: string }) {
  let places;
  try {
    places = await listThingPlaces(siteId);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.things_unavailable}</Notice>;
  }
  const rooms = roomSuggestions(places);
  if (places.length === 0) {
    return (
      <EmptyState action={<NewPlace siteId={siteId} rooms={rooms} variant="primary" />}>{thingsEmptyText}</EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PlacesList places={places} />
      <NewPlace siteId={siteId} rooms={rooms} variant="text" />
    </div>
  );
}

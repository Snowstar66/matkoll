import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { type PantrySiteWithCount, type SelectedSite } from "@/features/pantry";
import { listPantrySitesWithCounts, PantryDataError } from "@/features/pantry/server";
import { SiteSwitch, SiteSwitchProvider } from "@/features/pantry/ui/site-switch";
import { takeCardSubText, takeCardText, thingsEmptyText, type IndexedPlace, type RoomSummary } from "@/features/things";
import { getThingIndex, listRooms, ThingsDataError } from "@/features/things/server";
import { ThingFinder } from "@/features/things/ui/thing-finder";
import { RoomsList } from "@/features/things/ui/rooms-list";
import { TakeCard } from "@/features/things/ui/take-card";
import { errorMessages } from "@/lib/errors";

/**
 * The tab's data: the user's boenden (for the pills) and the rooms of the
 * selected one. The data's <Suspense> is keyed on the boende, so choosing
 * another shows the skeleton rows instead of the old rooms. When the boenden
 * or the rooms cannot be read, a notice says so; other errors go to the error boundary.
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
        <PageHeader title="Förråd" />
        <Notice role="alert">{errorMessages.things_unavailable}</Notice>
      </>
    );
  }
  const site: SelectedSite = { id: selected.id, name: selected.name, siteCount: sites.length };

  const places = (
    <SiteSwitch sites={sites} selected={site}>
      <Suspense key={site.id} fallback={<Skeleton rows={3} />}>
        <Rooms site={site} />
      </Suspense>
    </SiteSwitch>
  );
  return (
    <SiteSwitchProvider>
      <PageHeader title="Förråd" />
      {places}
    </SiteSwitchProvider>
  );
}

/**
 * "Ta kort" first, then (when there are cards) the search and the question
 * over every boende (Story 18.4) and the rooms of this boende with their
 * counts, read by the database (Story 18.11). When the index cannot be read
 * the tab works without search.
 */
async function Rooms({ site }: { site: SelectedSite }) {
  let rooms: RoomSummary[];
  let index: IndexedPlace[] = [];
  try {
    rooms = await listRooms(site.id);
    index = await getThingIndex();
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.things_unavailable}</Notice>;
  }
  const take = (
    <TakeCard siteId={site.id} rooms={rooms.map((room) => room.room)} variant="primary" title={takeCardText} sub={takeCardSubText} />
  );
  if (rooms.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {take}
        <EmptyState>{thingsEmptyText}</EmptyState>
      </div>
    );
  }
  const list = <RoomsList siteId={site.id} rooms={rooms} />;
  return (
    <div className="flex flex-col gap-4">
      {take}
      {index.some((place) => place.things.length > 0) ? <ThingFinder places={index}>{list}</ThingFinder> : list}
    </div>
  );
}

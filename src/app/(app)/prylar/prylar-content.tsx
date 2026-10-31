import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { type PantrySiteWithCount, type SelectedSite } from "@/features/pantry";
import { listPantrySitesWithCounts, PantryDataError } from "@/features/pantry/server";
import { BoendeVal } from "@/features/pantry/ui/boende-val";
import { SiteSwitch } from "@/features/pantry/ui/site-switch";
import { thingsEmptyText, type RoomSummary } from "@/features/things";
import { listRooms, ThingsDataError } from "@/features/things/server";
import { ThingFinder } from "@/features/things/ui/thing-finder";
import { RoomsList } from "@/features/things/ui/rooms-list";
import { NewRoom } from "@/features/things/ui/new-room";
import { RoomsRefresh } from "@/features/things/ui/rooms-refresh";
import { errorMessages } from "@/lib/errors";
import { loadBoendeCounts } from "../boende-counts";

/**
 * The tab's data: the user's boenden (for the boende button under the title on a phone) and the rooms of the
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
    <>
      <PageHeader title="Förråd" />
      {/* A phone has no side menu: the boende is under the title (Story 16.14). */}
      <div className="-mt-2 mb-3 empty:hidden desktop:hidden">
        <BoendeVal variant="page" sites={sites} loadCounts={loadBoendeCounts} />
      </div>
      {places}
    </>
  );
}

/**
 * (When there are things) the chat and the search over
 * every boende (Stories 18.4 and 18.14, both by the database, nothing loads
 * every thing) and the rooms of this boende with their counts, read by the
 * database (Story 18.11), then "+ Nytt rum" (Story 18.21). Photos are taken in a room.
 */
async function Rooms({ site }: { site: SelectedSite }) {
  let rooms: RoomSummary[];
  try {
    rooms = await listRooms(site.id);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.things_unavailable}</Notice>;
  }
  if (rooms.length === 0) {
    return (
      <EmptyState className="items-stretch px-1.5 pt-4 pb-0 text-left" action={<NewRoom siteId={site.id} />}>
        {thingsEmptyText}
      </EmptyState>
    );
  }
  const list = (
    <div className="flex flex-col gap-2.5">
      <RoomsRefresh />
      <RoomsList siteId={site.id} rooms={rooms} />
      <NewRoom siteId={site.id} />
    </div>
  );
  return rooms.some((room) => room.things > 0) ? (
    <ThingFinder siteId={site.id} rooms={rooms.map((room) => room.room)}>
      {list}
    </ThingFinder>
  ) : (
    list
  );
}

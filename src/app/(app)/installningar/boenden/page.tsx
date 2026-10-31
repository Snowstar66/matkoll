import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { PantrySiteWithCount } from "@/features/pantry";
import { listPantrySitesWithCounts, PantryDataError } from "@/features/pantry/server";
import { HousingSettings, type SiteThingCounts } from "@/features/pantry/ui/housing-settings";
import { getClearCounts, ThingsDataError } from "@/features/things/server";
import { ClearSiteThings, type SiteThings } from "@/features/things/ui/clear-site";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Boenden" };

// Boenden (Story 14.7, an overview since Story 16.14): a card per boende with what is in it; rename, remove and add as in the sheet Boenden (FR-29).
export default function HousingPage() {
  return (
    <>
      <SettingsPageHeader title="Boenden" />
      <Suspense fallback={<Skeleton rows={2} />}>
        <HousingContent />
      </Suspense>
    </>
  );
}

async function HousingContent() {
  await requireUserOrRedirect("/installningar/boenden");
  let sites: PantrySiteWithCount[];
  try {
    sites = await listPantrySitesWithCounts();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.pantry_unavailable}</Notice>;
  }
  // What Förråd holds in each boende, for "Rensa förrådet" (Story 18.15); the list is left out when it cannot be read.
  let things: SiteThings[] = [];
  let thingCounts: Record<string, SiteThingCounts> | null = null;
  try {
    things = await Promise.all(sites.map(async (site) => ({ id: site.id, name: site.name, counts: await getClearCounts(site.id) })));
    // The same counts give the cards their prylar and kort (Story 16.14).
    thingCounts = Object.fromEntries(things.map((site) => [site.id, { things: site.counts.things, cards: site.counts.cards }]));
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
  }
  return (
    <div className="flex flex-col gap-6">
      <HousingSettings sites={sites} thingCounts={thingCounts} />
      <ClearSiteThings sites={things} />
    </div>
  );
}

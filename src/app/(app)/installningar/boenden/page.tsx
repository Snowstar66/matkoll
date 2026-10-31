import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { PantrySiteWithCount } from "@/features/pantry";
import { listPantrySitesWithCounts, PantryDataError } from "@/features/pantry/server";
import { HousingSettings } from "@/features/pantry/ui/housing-settings";
import { getClearCounts, ThingsDataError } from "@/features/things/server";
import { ClearSiteThings, type SiteThings } from "@/features/things/ui/clear-site";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Boenden" };

// Boenden (Story 14.7): what "Ställen" was, managed in the same sheet as in Matvaror (FR-29).
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
  try {
    things = await Promise.all(sites.map(async (site) => ({ id: site.id, name: site.name, counts: await getClearCounts(site.id) })));
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
  }
  return (
    <div className="flex flex-col gap-6">
      <HousingSettings sites={sites} />
      <ClearSiteThings sites={things} />
    </div>
  );
}
